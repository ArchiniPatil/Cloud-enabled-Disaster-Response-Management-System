import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config.js";
import { pool, transaction, audit, type DB } from "./db.js";
import { eligibleTeams } from "./policy.js";
import { notifyControl } from "./incidents.js";
import { escalationNeeded } from "../../../packages/core/src/domain.js";
import { s3 } from "./evidence.js";
import { reconcileReceipt } from "./sms-receipts.js";
const email = new SESv2Client({ region: config.AWS_REGION });
const sns = new SNSClient({ region: config.AWS_REGION });
export async function queueExternalNotifications(incidentId?: string) {
  // Only messages already persisted for authorized in-app recipients are mirrored.
  await pool.query(
    `INSERT INTO notification_jobs(incident_id,recipient_id,channel,dedupe_key)
    SELECT n.incident_id,n.recipient_id,channels.channel,lower(channels.channel)||':'||n.dedupe_key
    FROM notification_jobs n JOIN user_profiles u ON u.id=n.recipient_id
    CROSS JOIN (VALUES ('SMS'),('EMAIL')) channels(channel)
    WHERE n.channel='IN_APP' AND u.status='ACTIVE' AND u.role IN('AUTHORITY','RESCUER')
      AND n.created_at>now()-interval '1 day' AND ($2::uuid IS NULL OR n.incident_id=$2)
      AND (($1 AND u.cognito_sub LIKE 'demo:%') OR (channels.channel='SMS' AND u.sms_enabled AND u.phone IS NOT NULL) OR (channels.channel='EMAIL' AND u.email_notifications))
      AND NOT EXISTS(SELECT 1 FROM notification_jobs old WHERE old.dedupe_key=lower(channels.channel)||':'||n.dedupe_key)
    ORDER BY n.created_at LIMIT 200 ON CONFLICT(dedupe_key) DO NOTHING`,
    [config.NOTIFICATION_TRANSPORT === "simulator", incidentId ?? null],
  );
}
export async function consumeEvent(event: {
  id: string;
  type: string;
  payload: { incidentId?: string };
}) {
  await transaction(async (db) => {
    if (
      !(
        await db.query(
          "INSERT INTO processed_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id",
          [event.id],
        )
      ).rowCount
    )
      return;
    if (event.type === "INCIDENT_CREATED" && event.payload.incidentId) {
      await notifyControl(db, event.payload.incidentId, 0);
    }
    if (event.type === "STATUS_CHANGED" && event.payload.incidentId)
      await db.query(
        `INSERT INTO notification_jobs(incident_id,recipient_id,channel,dedupe_key,status) SELECT id,reporter_id,'IN_APP',$2,'AVAILABLE' FROM incidents WHERE id=$1 ON CONFLICT DO NOTHING`,
        [event.payload.incidentId, `citizen-status:${event.id}`],
      );
    await audit(db, null, "EVENT_CONSUMED", "event", event.id, {
      type: event.type,
    });
  });
  await queueExternalNotifications(event.payload.incidentId);
}
export async function flushOutbox() {
  const rows = (
    await pool.query(
      "SELECT id FROM outbox_events WHERE published_at IS NULL AND next_attempt<=now() ORDER BY created_at LIMIT 50",
    )
  ).rows;
  for (const row of rows) {
    await transaction(async (db) => {
      const e = (
        await db.query(
          "SELECT * FROM outbox_events WHERE id=$1 AND published_at IS NULL AND next_attempt<=now() FOR UPDATE SKIP LOCKED",
          [row.id],
        )
      ).rows[0];
      if (!e) return;
      try {
        if (config.EVENT_TOPIC_ARN)
          await sns.send(
            new PublishCommand({
              TopicArn: config.EVENT_TOPIC_ARN,
              Message: JSON.stringify({
                id: e.id,
                type: e.type,
                payload: e.payload,
              }),
            }),
          );
        else if (
          config.AUTH_MODE === "demo" ||
          config.EVENT_TRANSPORT === "database"
        )
          await consumeEvent(e);
        else throw new Error("Event topic missing");
        await db.query(
          "UPDATE outbox_events SET published_at=now(),attempts=attempts+1 WHERE id=$1",
          [e.id],
        );
      } catch {
        await db.query(
          "UPDATE outbox_events SET attempts=attempts+1,next_attempt=now()+least(300,power(2,least(attempts,8))) * interval '1 second' WHERE id=$1",
          [e.id],
        );
        console.error(
          JSON.stringify({ event: "outbox_publish_failed", id: e.id }),
        );
      }
    });
  }
}
async function notifyTeam(
  db: DB,
  incidentId: string,
  teamId: string,
  stage: number,
) {
  await db.query(
    `INSERT INTO notification_jobs(incident_id,recipient_id,channel,dedupe_key,status) SELECT $1,m.user_id,'IN_APP',$2||':'||m.user_id,'AVAILABLE' FROM team_memberships m JOIN user_profiles u ON u.id=m.user_id AND u.status='ACTIVE' WHERE m.team_id=$3 ON CONFLICT DO NOTHING`,
    [incidentId, `eligible:${incidentId}:${stage}`, teamId],
  );
}
export async function runEscalations() {
  const due = (
    await pool.query(
      "SELECT id FROM escalation_executions WHERE completed_at IS NULL AND due_at<=now() ORDER BY due_at LIMIT 50",
    )
  ).rows;
  for (const row of due)
    await transaction(async (db) => {
      const e = (
        await db.query(
          "SELECT * FROM escalation_executions WHERE id=$1 AND completed_at IS NULL AND due_at<=now() FOR UPDATE SKIP LOCKED",
          [row.id],
        )
      ).rows[0];
      if (!e) return;
      const i = (
        await db.query(
          "SELECT i.*,p.radii_m,p.delays_seconds FROM incidents i JOIN escalation_policies p ON p.id=i.policy_id WHERE i.id=$1 FOR UPDATE OF i",
          [e.incident_id],
        )
      ).rows[0];
      if (!i) {
        await db.query(
          "UPDATE escalation_executions SET completed_at=now(),outcome='NO_POLICY' WHERE id=$1",
          [e.id],
        );
        return;
      }
      const dispatched = !!(
        await db.query(
          "SELECT 1 FROM incident_assignments WHERE incident_id=$1 AND updated_at>=$2 AND status IN('DISPATCHED','EN_ROUTE','ARRIVED','IN_PROGRESS','COMPLETED')",
          [i.id, i.response_cycle_started_at],
        )
      ).rowCount;
      const accepted = !!(
        await db.query(
          "SELECT 1 FROM incident_assignments WHERE incident_id=$1 AND updated_at>=$2 AND status='ACCEPTED'",
          [i.id, i.response_cycle_started_at],
        )
      ).rowCount;
      let outcome = accepted ? "ACCEPTED_AWAITING_DISPATCH" : "SATISFIED";
      if (
        (e.force_review &&
          !["RESOLVED", "CANCELLED", "DUPLICATE", "UNABLE_TO_RESPOND"].includes(
            i.status,
          )) ||
        (!accepted && escalationNeeded(i.severity, i.status, dispatched))
      ) {
        await notifyControl(db, i.id, e.stage);
        if (e.stage > 0)
          await db.query(
            `INSERT INTO notification_jobs(incident_id,recipient_id,channel,dedupe_key,status) SELECT $1,u.supervisor_id,'IN_APP',$2||':'||u.supervisor_id,'AVAILABLE' FROM user_profiles u JOIN incident_departments d ON d.department_id=u.department_id WHERE d.incident_id=$1 AND u.supervisor_id IS NOT NULL ON CONFLICT DO NOTHING`,
            [i.id, `supervisor:${i.id}:${e.stage}`],
          );
        const index = Math.min(e.policy_stage ?? e.stage, i.radii_m.length - 1);
        const teams = await eligibleTeams(db, i.id, i.radii_m[index]);
        for (const t of teams) await notifyTeam(db, i.id, t.id, e.stage);
        outcome = teams.length
          ? `ALERTED_${teams.length}_TEAMS`
          : "NO_ELIGIBLE_TEAM";
        const next = e.stage + 1;
        if (index + 1 < i.radii_m.length) {
          await db.query(
            "INSERT INTO escalation_executions(incident_id,stage,due_at,policy_stage) VALUES($1,$2,now()+$3*interval '1 second',$4) ON CONFLICT DO NOTHING",
            [
              i.id,
              next,
              Math.max(
                1,
                i.delays_seconds[index + 1] - i.delays_seconds[index],
              ),
              index + 1,
            ],
          );
          await db.query(
            "UPDATE incidents SET escalation_state=$2 WHERE id=$1",
            [i.id, teams.length ? "AWAITING_RESPONSE" : "NO_ELIGIBLE_TEAM"],
          );
        } else {
          await db.query(
            "UPDATE incidents SET escalation_state='REGIONAL_REVIEW_REQUIRED' WHERE id=$1",
            [i.id],
          );
          outcome += ":REGIONAL_REVIEW_REQUIRED";
        }
      }
      await db.query(
        "UPDATE escalation_executions SET completed_at=now(),outcome=$2 WHERE id=$1",
        [e.id, outcome],
      );
      await audit(db, null, "ESCALATION", "incident", i.id, {
        stage: e.stage,
        outcome,
      });
    });
}
export async function sendNotifications() {
  if (config.NOTIFICATION_TRANSPORT === "simulator") {
    await transaction(async (db) => {
      const jobs = (
        await db.query(
          "SELECT id FROM notification_jobs WHERE channel IN('SMS','EMAIL') AND status='PENDING' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20",
        )
      ).rows;
      for (const job of jobs) {
        await db.query(
          "UPDATE notification_jobs SET status='SIMULATED' WHERE id=$1",
          [job.id],
        );
        await db.query(
          "INSERT INTO notification_attempts(job_id,outcome,error_code) VALUES($1,'SIMULATED','LOCAL_SINK_NO_EXTERNAL_DELIVERY')",
          [job.id],
        );
      }
    });
    return;
  }
  if (config.SMS_ENABLED !== "true" && !config.EMAIL_FROM) return;
  for (let n = 0; n < 20; n++) {
    const job = await transaction(async (db) => {
      const j = (
        await db.query(
          `SELECT n.id,n.incident_id,n.channel,u.phone,u.email FROM notification_jobs n JOIN user_profiles u ON u.id=n.recipient_id WHERE ((n.channel='SMS' AND $1 AND u.sms_enabled) OR (n.channel='EMAIL' AND $2 AND u.email_notifications)) AND n.status='PENDING' AND u.status='ACTIVE' AND (SELECT count(*) FROM notification_attempts a WHERE a.job_id=n.id AND a.outcome='SENDING')<3 AND (SELECT count(*) FROM notification_jobs recent WHERE recent.recipient_id=n.recipient_id AND recent.channel=n.channel AND recent.status IN('SUBMITTED','UNKNOWN') AND recent.created_at>now()-interval '1 hour')<6 ORDER BY n.created_at FOR UPDATE OF n SKIP LOCKED LIMIT 1`,
          [config.SMS_ENABLED === "true", !!config.EMAIL_FROM],
        )
      ).rows[0];
      if (j) {
        await db.query(
          "UPDATE notification_jobs SET status='UNKNOWN' WHERE id=$1",
          [j.id],
        );
        await db.query(
          "INSERT INTO notification_attempts(job_id,outcome) VALUES($1,'SENDING')",
          [j.id],
        );
      }
      return j;
    });
    if (!job) break;
    try {
      const result =
        job.channel === "EMAIL"
          ? await email.send(
              new SendEmailCommand({
                FromEmailAddress: config.EMAIL_FROM,
                Destination: { ToAddresses: [job.email] },
                Content: {
                  Simple: {
                    Subject: { Data: "Response coordination update" },
                    Body: {
                      Text: {
                        Data: `Incident ${job.incident_id} has an update. Sign in at ${config.APP_ORIGIN} to review authorized details. This notification is not dispatch confirmation.`,
                      },
                    },
                  },
                },
              }),
            )
          : await sns.send(
              new PublishCommand({
                PhoneNumber: job.phone,
                Message: `Response coordination: incident ${job.incident_id}. Sign in to review. Notification is not dispatch confirmation.`,
                MessageAttributes: {
                  "AWS.SNS.SMS.SMSType": {
                    DataType: "String",
                    StringValue: "Transactional",
                  },
                },
              }),
            );
      await transaction(async (db) => {
        await db.query(
          "UPDATE notification_jobs SET status='SUBMITTED' WHERE id=$1",
          [job.id],
        );
        await db.query(
          "INSERT INTO notification_attempts(job_id,provider_id,outcome) VALUES($1,$2,'SUBMITTED')",
          [job.id, result.MessageId],
        );
        if (job.channel === "SMS" && result.MessageId)
          await reconcileReceipt(db, result.MessageId);
      });
    } catch (e) {
      const error = e as {
        $metadata?: { httpStatusCode?: number };
        name?: string;
      };
      const definite =
        !!error.$metadata?.httpStatusCode &&
        error.$metadata.httpStatusCode < 500;
      await transaction(async (db) => {
        await db.query("UPDATE notification_jobs SET status=$2 WHERE id=$1", [
          job.id,
          definite ? "FAILED" : "UNKNOWN",
        ]);
        await db.query(
          "INSERT INTO notification_attempts(job_id,outcome,error_code) VALUES($1,$2,$3)",
          [
            job.id,
            definite ? "FAILED" : "UNKNOWN",
            error.name ?? "PROVIDER_ERROR",
          ],
        );
      });
      console.error(
        JSON.stringify({ event: "notification_failed", jobId: job.id }),
      );
    }
  }
}
export async function maintenance() {
  await transaction(async (db) => {
    await db.query(
      "DELETE FROM team_location_updates WHERE received_at<now()-$1*interval '1 hour'",
      [config.LOCATION_RETENTION_HOURS],
    );
    await db.query(
      "UPDATE rescue_teams SET location=NULL,location_at=NULL,accuracy=NULL WHERE location_at<now()-$1*interval '1 hour'",
      [config.LOCATION_RETENTION_HOURS],
    );
    await db.query(
      "UPDATE location_sessions SET active=false,stopped_at=now() WHERE active AND expires_at<=now()",
    );
    await db.query("DELETE FROM sessions WHERE expires_at<=now()");
    await db.query("DELETE FROM oauth_states WHERE expires_at<=now()");
  });
}
export async function exportAnalytics() {
  if (!config.ANALYTICS_BUCKET) return;
  await transaction(async (db) => {
    if (
      !(
        await db.query(
          "SELECT pg_try_advisory_xact_lock(hashtext('analytics')) locked",
        )
      ).rows[0].locked
    )
      return;
    const day = (await db.query("SELECT (current_date-1)::text AS day")).rows[0]
      .day;
    if (
      (await db.query("SELECT 1 FROM analytics_exports WHERE day=$1", [day]))
        .rowCount
    )
      return;
    const data = (
      await db.query(
        `SELECT i.category,i.severity,i.status,count(*)::int incident_count,avg(extract(epoch FROM (i.updated_at-i.created_at)))::float8 age_seconds,
        avg(extract(epoch FROM (h.ack-i.response_cycle_started_at)))::float8 acknowledgement_seconds,
        avg(extract(epoch FROM (h.arrived-i.response_cycle_started_at)))::float8 arrival_seconds,
        avg(extract(epoch FROM (h.resolved-i.response_cycle_started_at)))::float8 resolution_seconds,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM escalation_executions e WHERE e.incident_id=i.id AND e.stage>0 AND e.completed_at IS NOT NULL AND e.outcome<>'SATISFIED'))::int escalated_count
        FROM incidents i LEFT JOIN LATERAL(SELECT min(created_at) FILTER(WHERE to_status='ACKNOWLEDGED') ack,min(created_at) FILTER(WHERE to_status='TEAM_ON_SCENE') arrived,min(created_at) FILTER(WHERE to_status='RESOLVED') resolved FROM incident_status_history WHERE incident_id=i.id AND created_at>=i.response_cycle_started_at) h ON true
        WHERE i.created_at >= $1::date AND i.created_at < $1::date+interval '1 day' GROUP BY i.category,i.severity,i.status`,
        [day],
      )
    ).rows;
    const key = `daily/day=${day}/incidents.json`;
    await s3.send(
      new PutObjectCommand({
        Bucket: config.ANALYTICS_BUCKET,
        Key: key,
        Body: data.map((d) => JSON.stringify({ ...d, day })).join("\n"),
        ContentType: "application/x-ndjson",
        ServerSideEncryption: "AES256",
      }),
    );
    const teams = (
      await db.query(
        `SELECT t.department_id,t.availability,count(*)::int team_count,sum(t.capacity)::int capacity,
      sum((SELECT count(*) FROM incident_assignments a WHERE a.team_id=t.id AND a.status NOT IN('COMPLETED','DECLINED','CANCELLED')))::int active_assignments,
      sum((SELECT count(*) FROM incident_assignments a WHERE a.team_id=t.id AND a.status='COMPLETED' AND a.updated_at >= $1::date AND a.updated_at < $1::date+interval '1 day'))::int completed_assignments
      FROM rescue_teams t GROUP BY t.department_id,t.availability`,
        [day],
      )
    ).rows;
    const resources = (
      await db.query(`SELECT r.department_id,r.type,r.status,sum(r.quantity)::int quantity,
      sum(coalesce((SELECT sum(a.quantity) FROM resource_allocations a WHERE a.resource_id=r.id AND a.released_at IS NULL),0))::int allocated
      FROM resources r GROUP BY r.department_id,r.type,r.status`)
    ).rows;
    for (const [dataset, rows] of [
      ["teams", teams],
      ["resources", resources],
    ] as const)
      await s3.send(
        new PutObjectCommand({
          Bucket: config.ANALYTICS_BUCKET,
          Key: `${dataset}/day=${day}/snapshot.json`,
          Body: rows
            .map((d) =>
              JSON.stringify({
                ...d,
                day,
                snapshot_at: new Date().toISOString(),
              }),
            )
            .join("\n"),
          ContentType: "application/x-ndjson",
          ServerSideEncryption: "AES256",
        }),
      );
    await db.query(
      "INSERT INTO analytics_exports(day,object_key) VALUES($1,$2)",
      [day, key],
    );
  });
}
export async function tick() {
  await pool.query(
    "INSERT INTO runtime_heartbeats(name,last_seen) VALUES('worker',now()) ON CONFLICT(name) DO UPDATE SET last_seen=now()",
  );
  await flushOutbox();
  await runEscalations();
  await queueExternalNotifications();
  await sendNotifications();
  await maintenance();
  await exportAnalytics();
}
