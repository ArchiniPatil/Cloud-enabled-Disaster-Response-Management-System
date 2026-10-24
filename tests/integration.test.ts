import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import pg from "pg";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { prepareDatabase } from "../scripts/prepare-database";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { app } from "../apps/api/src/app";
import { pool } from "../apps/api/src/db";
import {
  consumeEvent,
  runEscalations,
  flushOutbox,
  maintenance,
  sendNotifications,
} from "../apps/api/src/jobs";
import { SNSClient } from "@aws-sdk/client-sns";
import { config } from "../apps/api/src/config";
import { s3 } from "../apps/api/src/evidence";
import {
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { handler as queueHandler } from "../apps/api/src/lambda";
import { hash } from "../apps/api/src/auth";
const origin = "http://localhost:5173";
type Client = {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  user: any;
};
let citizen: Client,
  authority: Client,
  rescuer: Client,
  admin: Client,
  teamId: string,
  incidentId: string,
  assignmentId: string,
  locationSession: string;
const body = {
  kind: "EMERGENCY",
  category: "MEDICAL",
  severity: "CRITICAL",
  latitude: 19.076,
  longitude: 72.8777,
  description: "Controlled automated test incident",
  address: "",
};
async function login(role: string): Promise<Client> {
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/demo")
    .set("Origin", origin)
    .send({ email: `${role}@demo.invalid` })
    .expect(200);
  const me = await agent.get("/api/v1/auth/me").expect(200);
  return { agent, csrf: me.body.csrf, user: me.body.user };
}
function post(c: Client, path: string, b: any, key = randomUUID()) {
  return c.agent
    .post(`/api/v1${path}`)
    .set("Origin", origin)
    .set("X-CSRF-Token", c.csrf)
    .set("Idempotency-Key", key)
    .send(b);
}
async function report() {
  return (await post(citizen, "/incidents", body).expect(201)).body
    .id as string;
}
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Tests require a dedicated database ending in _test");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await pool.query(await readFile("db/migrations/001_initial.sql", "utf8"));
  await pool.query(
    await readFile("db/migrations/002_operational_controls.sql", "utf8"),
  );
  await pool.query(
    await readFile("db/migrations/003_reference_catalog.sql", "utf8"),
  );
  await pool.query(
    await readFile("db/migrations/004_reopened_response_cycles.sql", "utf8"),
  );
  await pool.query("CREATE TABLE schema_migrations(name text PRIMARY KEY)");
  await pool.query(
    "INSERT INTO schema_migrations VALUES('001_initial.sql'),('002_operational_controls.sql'),('003_reference_catalog.sql'),('004_reopened_response_cycles.sql')",
  );
  execFileSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
    env: process.env,
    stdio: "pipe",
  });
  citizen = await login("citizen");
  authority = await login("authority");
  rescuer = await login("rescuer");
  admin = await login("admin");
  teamId = (
    await pool.query("SELECT team_id FROM team_memberships WHERE user_id=$1", [
      rescuer.user.id,
    ])
  ).rows[0].team_id;
});
afterAll(async () => {
  await pool.end();
});
describe("real PostGIS API workflow and security boundaries", () => {
  it("limits the production-style runtime database role to DML without audit mutation", async () => {
    const password = randomUUID() + randomUUID();
    const spy = vi
      .spyOn(SecretsManagerClient.prototype, "send")
      .mockResolvedValue({
        SecretString: JSON.stringify({ username: "response_app", password }),
      } as never);
    process.env.APP_DB_SECRET_ARN = "local-test-stub";
    try {
      await prepareDatabase();
      const url = new URL(process.env.DATABASE_URL!);
      url.username = "response_app";
      url.password = password;
      const runtime = new pg.Pool({ connectionString: url.toString() });
      try {
        await expect(
          runtime.query("SELECT id FROM incidents LIMIT 1"),
        ).resolves.toHaveProperty("rowCount");
        await expect(
          runtime.query("CREATE TABLE forbidden_ddl(id int)"),
        ).rejects.toThrow();
        await expect(
          runtime.query("DELETE FROM audit_events"),
        ).rejects.toThrow();
        await expect(
          runtime.query("DELETE FROM schema_migrations"),
        ).rejects.toThrow();
      } finally {
        await runtime.end();
      }
    } finally {
      spy.mockRestore();
      delete process.env.APP_DB_SECRET_ARN;
    }
  });
  it("requires sign-in, enforces CSRF and rejects client role escalation", async () => {
    await request(app).get("/api/v1/incidents").expect(401);
    await citizen.agent.post("/api/v1/incidents").send(body).expect(403);
    await post(citizen, "/incidents", { ...body, role: "ADMIN" }).expect(400);
    await citizen.agent.get("/api/v1/admin/users").expect(403);
    await post(citizen, "/admin/users", {
      email: "x@test.invalid",
      role: "ADMIN",
    }).expect(403);
  });
  it("persists reports once and creates control-room alerts before matching", async () => {
    const key = randomUUID();
    const a = await post(citizen, "/incidents", body, key).expect(201),
      b = await post(citizen, "/incidents", body, key).expect(201);
    expect(a.body.id).toBe(b.body.id);
    incidentId = a.body.id;
    await post(
      citizen,
      "/incidents",
      { ...body, description: "changed" },
      key,
    ).expect(409);
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM notification_jobs WHERE incident_id=$1 AND recipient_id=$2 AND channel='IN_APP'",
            [incidentId, authority.user.id],
          )
        ).rows[0].count,
      ),
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT ST_SRID(location::geometry) srid FROM incidents WHERE id=$1",
          [incidentId],
        )
      ).rows[0].srid,
    ).toBe(4326);
  });
  it("hides unrelated incidents and enforces department and geographic boundaries", async () => {
    await rescuer.agent.get(`/api/v1/incidents/${incidentId}`).expect(404);
    const fire = await post(citizen, "/incidents", {
      ...body,
      category: "FIRE",
    }).expect(201);
    await authority.agent.get(`/api/v1/incidents/${fire.body.id}`).expect(404);
    const distant = await post(citizen, "/incidents", {
      ...body,
      latitude: 28.6,
      longitude: 77.2,
    }).expect(201);
    await authority.agent
      .get(`/api/v1/incidents/${distant.body.id}`)
      .expect(404);
    const token = randomUUID(),
      user = (
        await pool.query(
          "INSERT INTO user_profiles(cognito_sub,email,name,role) VALUES($1,$2,'Other citizen','CITIZEN') RETURNING id",
          [randomUUID(), `${randomUUID()}@test.invalid`],
        )
      ).rows[0];
    await pool.query(
      "INSERT INTO sessions(id_hash,user_id,csrf,version,access_expires,expires_at) VALUES($1,$2,'test',1,now()+interval '10 minutes',now()+interval '1 hour')",
      [hash(token), user.id],
    );
    await request(app)
      .get(`/api/v1/incidents/${incidentId}`)
      .set("Cookie", `response_session=${token}`)
      .expect(404);
    await request(app)
      .get(`/api/v1/locations/incidents/${incidentId}`)
      .set("Cookie", `response_session=${token}`)
      .expect(404);
  });
  it("durably records no-team escalation and deduplicates repeated events", async () => {
    await runEscalations();
    expect(
      (
        await pool.query("SELECT escalation_state FROM incidents WHERE id=$1", [
          incidentId,
        ])
      ).rows[0].escalation_state,
    ).toBe("NO_ELIGIBLE_TEAM");
    expect(
      (
        await pool.query(
          "SELECT count(*) n FROM escalation_executions WHERE incident_id=$1",
          [incidentId],
        )
      ).rows[0].n,
    ).toBe("2");
    const event = {
      id: randomUUID(),
      type: "INCIDENT_CREATED",
      payload: { incidentId },
    };
    await Promise.all([consumeEvent(event), consumeEvent(event)]);
    expect(
      (
        await pool.query(
          "SELECT count(*) n FROM processed_events WHERE id=$1",
          [event.id],
        )
      ).rows[0].n,
    ).toBe("1");
    await runEscalations();
    expect(
      (
        await pool.query(
          "SELECT count(*) n FROM escalation_executions WHERE incident_id=$1",
          [incidentId],
        )
      ).rows[0].n,
    ).toBe("2");
  });
  it("requires on-duty fresh GPS and correct qualifications for spatial matching", async () => {
    await post(rescuer, "/locations/sessions", { teamId }).expect(409);
    await post(rescuer, `/teams/${teamId}/duty`, {
      availability: "AVAILABLE",
    }).expect(200);
    locationSession = (
      await post(rescuer, "/locations/sessions", { teamId }).expect(201)
    ).body.id;
    await post(rescuer, "/locations/updates", {
      sessionId: locationSession,
      latitude: 19.077,
      longitude: 72.878,
      accuracy: 12,
      observedAt: new Date().toISOString(),
    }).expect(202);
    const matches = await authority.agent
      .get(`/api/v1/incidents/${incidentId}/eligible-teams`)
      .expect(200);
    expect(matches.body.items[0].id).toBe(teamId);
    expect(matches.body.items[0].distance_m).toBeLessThan(200);
    await post(rescuer, "/locations/updates", {
      sessionId: locationSession,
      latitude: 19,
      longitude: 72,
      accuracy: 10,
      observedAt: new Date(Date.now() - 120000).toISOString(),
    }).expect(400);
  });
  it("validates incident transitions and preserves critical escalation after acknowledgement", async () => {
    await post(authority, `/incidents/${incidentId}/status`, {
      status: "RESOLVED",
    }).expect(409);
    await post(authority, `/incidents/${incidentId}/status`, {
      status: "ACKNOWLEDGED",
    }).expect(200);
    await pool.query(
      "UPDATE escalation_executions SET due_at=now() WHERE incident_id=$1 AND completed_at IS NULL",
      [incidentId],
    );
    await runEscalations();
    expect(
      (
        await pool.query(
          "SELECT outcome FROM escalation_executions WHERE incident_id=$1 AND stage=1",
          [incidentId],
        )
      ).rows[0].outcome,
    ).toBe("ALERTED_1_TEAMS");
  });
  it("prevents concurrent conflicting assignments using database locks", async () => {
    const other = await report();
    await post(authority, `/incidents/${other}/status`, {
      status: "ACKNOWLEDGED",
    }).expect(200);
    const results = await Promise.all([
      post(authority, "/assignments", { incidentId, teamId }),
      post(authority, "/assignments", { incidentId: other, teamId }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const winner = results.find((r) => r.status === 201)!;
    incidentId = winner.body.incident_id;
    assignmentId = winner.body.id;
    expect(
      (
        await pool.query(
          "SELECT count(*) n FROM incident_assignments WHERE team_id=$1 AND status='OFFERED'",
          [teamId],
        )
      ).rows[0].n,
    ).toBe("1");
  });
  it("separates team acceptance from dispatcher authorization", async () => {
    await post(citizen, `/assignments/${assignmentId}/status`, {
      status: "ACCEPTED",
    }).expect(404);
    await post(authority, `/assignments/${assignmentId}/status`, {
      status: "DISPATCHED",
    }).expect(409);
    await post(rescuer, `/assignments/${assignmentId}/status`, {
      status: "ACCEPTED",
    }).expect(200);
    await post(rescuer, `/assignments/${assignmentId}/status`, {
      status: "DISPATCHED",
    }).expect(403);
    await post(authority, `/assignments/${assignmentId}/status`, {
      status: "DISPATCHED",
    }).expect(200);
  });
  it("shares location only for an active authorized assignment and labels stale GPS", async () => {
    let r = await citizen.agent
      .get(`/api/v1/locations/incidents/${incidentId}`)
      .expect(200);
    expect(r.body.teams[0].tracking).toBe("LIVE");
    expect(r.body.teams[0].route).toBeNull();
    await pool.query(
      "UPDATE rescue_teams SET location_at=now()-interval '2 minutes' WHERE id=$1",
      [teamId],
    );
    r = await citizen.agent
      .get(`/api/v1/locations/incidents/${incidentId}`)
      .expect(200);
    expect(r.body.teams[0].tracking).toBe("STALE");
  });
  it("completes the response lifecycle and records append-only audit", async () => {
    for (const status of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"])
      await post(rescuer, `/assignments/${assignmentId}/status`, {
        status,
      }).expect(200);
    const r = await citizen.agent
      .get(`/api/v1/incidents/${incidentId}`)
      .expect(200);
    expect(r.body.status).toBe("RESOLVED");
    expect(r.body.history.map((h: any) => h.to_status)).toContain(
      "TEAM_ON_SCENE",
    );
    expect(
      (await citizen.agent.get(`/api/v1/locations/incidents/${incidentId}`))
        .body.teams,
    ).toHaveLength(0);
    await expect(
      pool.query("DELETE FROM audit_events WHERE entity_id=$1", [incidentId]),
    ).rejects.toThrow("Append-only");
    await expect(
      pool.query(
        "UPDATE incident_status_history SET note=$1 WHERE incident_id=$2",
        ["tampered", incidentId],
      ),
    ).rejects.toThrow("Append-only");
  });
  it("restarts escalation after reopening without counting a previous completed dispatch", async () => {
    await post(authority, `/incidents/${incidentId}/status`, {
      status: "REOPENED",
    }).expect(200);
    await runEscalations();
    const current = (
      await pool.query(
        "SELECT * FROM escalation_executions WHERE incident_id=$1 AND completed_at IS NOT NULL ORDER BY stage DESC LIMIT 1",
        [incidentId],
      )
    ).rows[0];
    expect(current.policy_stage).toBe(0);
    expect(current.outcome).toBe("NO_ELIGIBLE_TEAM");
    expect(
      (
        await pool.query(
          "SELECT count(*) n FROM escalation_executions WHERE incident_id=$1 AND completed_at IS NULL",
          [incidentId],
        )
      ).rows[0].n,
    ).toBe("1");
    await post(authority, `/incidents/${incidentId}/status`, {
      status: "CANCELLED",
    }).expect(200);
  });
  it("rejects invalid pagination as client input rather than a database error", async () => {
    await citizen.agent.get("/api/v1/incidents?limit=1.5").expect(400);
    await citizen.agent.get("/api/v1/incidents?offset=-1").expect(400);
    await citizen.agent.get("/api/v1/incidents?limit=100").expect(200);
  });
  it("prevents inventory over-allocation transactionally", async () => {
    const activeIncident = await report();
    const resource = (await pool.query("SELECT id FROM resources LIMIT 1"))
      .rows[0];
    const results = await Promise.all([
      post(authority, `/resources/${resource.id}/allocate`, {
        incidentId: activeIncident,
        quantity: 8,
      }),
      post(authority, `/resources/${resource.id}/allocate`, {
        incidentId: activeIncident,
        quantity: 8,
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    await post(
      authority,
      `/resources/allocations/${results.find((r) => r.status === 201)!.body.id}/release`,
      {},
    ).expect(200);
  });
  it("protects announcements and never publishes sensitive reports", async () => {
    await post(citizen, "/announcements", { title: "Unauthorized" }).expect(
      403,
    );
    await post(authority, `/incidents/${incidentId}/publish`, {
      published: true,
    }).expect(409);
    await post(authority, "/announcements", {
      title: "Private test notice",
      body: "Authorities only message",
      audience: "AUTHORITIES_ONLY",
      importance: "IMPORTANT",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }).expect(201);
    expect(
      (await citizen.agent.get("/api/v1/announcements")).body.items,
    ).toHaveLength(0);
    expect(
      (await authority.agent.get("/api/v1/announcements")).body.items,
    ).toHaveLength(1);
    expect(
      (await citizen.agent.get("/api/v1/situation")).body.items,
    ).toHaveLength(0);
  });
  it("fails explicitly when storage or Cognito invitations are unconfigured", async () => {
    await post(citizen, "/evidence/upload", {
      incidentId,
      contentType: "image/jpeg",
      size: 100,
    }).expect(503);
    await post(admin, "/admin/users", {
      email: "new@test.invalid",
      name: "New authority",
      role: "AUTHORITY",
      departmentId: authority.user.department_id,
      jurisdictionId: authority.user.jurisdiction_id,
      permissions: [],
    }).expect(503);
  });
  it("retains escalation across a new worker process and repairs outbox backlog", async () => {
    const id = await report();
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        "const {runEscalations}=await import('./apps/api/src/jobs.ts');await runEscalations();const {pool}=await import('./apps/api/src/db.ts');await pool.end();",
      ],
      { env: process.env, stdio: "pipe" },
    );
    expect(
      (
        await pool.query(
          "SELECT completed_at FROM escalation_executions WHERE incident_id=$1 AND stage=0",
          [id],
        )
      ).rows[0].completed_at,
    ).not.toBeNull();
    await flushOutbox();
    expect(
      (
        await pool.query(
          "SELECT count(*) n FROM outbox_events WHERE published_at IS NULL",
        )
      ).rows[0].n,
    ).toBe("0");
    await maintenance();
  });

  it("records SMS provider acceptance and ambiguous failures without duplicate sends (SDK stub)", async () => {
    const spy = vi.spyOn(SNSClient.prototype, "send");
    const original = config.SMS_ENABLED;
    config.SMS_ENABLED = "true";
    try {
      await pool.query(
        "UPDATE user_profiles SET sms_enabled=true,phone='+999000000001' WHERE id=$1",
        [authority.user.id],
      );
      await pool.query(
        "UPDATE notification_jobs SET status='FAILED' WHERE channel='SMS'",
      );
      const add = async () =>
        (
          await pool.query(
            "INSERT INTO notification_jobs(incident_id,recipient_id,channel,dedupe_key) VALUES($1,$2,'SMS',$3) RETURNING id",
            [incidentId, authority.user.id, randomUUID()],
          )
        ).rows[0].id;
      const success = await add();
      spy.mockResolvedValueOnce({ MessageId: "stub-message-id" } as never);
      await sendNotifications();
      expect(
        (
          await pool.query("SELECT status FROM notification_jobs WHERE id=$1", [
            success,
          ])
        ).rows[0].status,
      ).toBe("SUBMITTED");
      const unknown = await add();
      spy.mockRejectedValueOnce(new Error("Network interrupted after request"));
      await sendNotifications();
      expect(
        (
          await pool.query("SELECT status FROM notification_jobs WHERE id=$1", [
            unknown,
          ])
        ).rows[0].status,
      ).toBe("UNKNOWN");
      const calls = spy.mock.calls.length;
      await sendNotifications();
      expect(spy.mock.calls.length).toBe(calls);
      await post(admin, `/admin/notifications/${unknown}/retry`, {}).expect(
        409,
      );
    } finally {
      config.SMS_ENABLED = original;
      spy.mockRestore();
      await pool.query(
        "UPDATE user_profiles SET sms_enabled=false,phone=NULL WHERE id=$1",
        [authority.user.id],
      );
    }
  });
  it("retains an outbox event after provider failure and recovers on retry (SDK stub)", async () => {
    const id = await report();
    const spy = vi.spyOn(SNSClient.prototype, "send");
    const previous = config.EVENT_TOPIC_ARN;
    config.EVENT_TOPIC_ARN = "arn:aws:sns:ap-south-1:000000000000:local-test";
    try {
      spy.mockRejectedValue(new Error("Provider unavailable"));
      await flushOutbox();
      const event = (
        await pool.query(
          "SELECT * FROM outbox_events WHERE payload->>'incidentId'=$1 AND type='INCIDENT_CREATED'",
          [id],
        )
      ).rows[0];
      expect(event.published_at).toBeNull();
      expect(event.attempts).toBeGreaterThan(0);
      await pool.query(
        "UPDATE outbox_events SET next_attempt=now() WHERE id=$1",
        [event.id],
      );
      spy.mockResolvedValue({ MessageId: "stub-recovery" } as never);
      await flushOutbox();
      expect(
        (
          await pool.query(
            "SELECT published_at FROM outbox_events WHERE id=$1",
            [event.id],
          )
        ).rows[0].published_at,
      ).not.toBeNull();
    } finally {
      config.EVENT_TOPIC_ARN = previous;
      spy.mockRestore();
    }
  });
  it("finalizes only verified evidence outside the writable upload prefix (SDK stub)", async () => {
    const previous = config.EVIDENCE_BUCKET;
    config.EVIDENCE_BUCKET = "local-evidence-contract";
    const id = randomUUID(),
      key = `pending/${incidentId}/${id}`;
    await pool.query(
      "INSERT INTO incident_evidence(id,incident_id,owner_id,object_key,content_type,size_bytes) VALUES($1,$2,$3,$4,'image/png',100)",
      [id, incidentId, citizen.user.id, key],
    );
    const spy = vi.spyOn(s3, "send").mockImplementation((async (
      command: any,
    ) => {
      if (command instanceof HeadObjectCommand)
        return {
          ContentLength: 100,
          ContentType: "image/png",
          ETag: '"test-etag"',
          VersionId: "test-version",
        };
      if (command instanceof GetObjectCommand)
        return {
          Body: {
            transformToByteArray: async () =>
              new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
          },
        };
      return {};
    }) as any);
    try {
      await post(citizen, `/evidence/${id}/complete`, {}).expect(200);
      const row = (
        await pool.query("SELECT * FROM incident_evidence WHERE id=$1", [id])
      ).rows[0];
      expect(row.status).toBe("AVAILABLE");
      expect(row.object_key).toBe(`evidence/${incidentId}/${id}`);
      const copy = spy.mock.calls
        .map((c) => c[0])
        .find((c) => c instanceof CopyObjectCommand) as CopyObjectCommand;
      expect(copy.input.CopySource).toContain("versionId=test-version");
      expect(copy.input.CopySourceIfMatch).toBe('"test-etag"');
      const calls = spy.mock.calls.length;
      await post(citizen, `/evidence/${id}/complete`, {}).expect(200);
      expect(spy.mock.calls.length).toBe(calls);
    } finally {
      config.EVIDENCE_BUCKET = previous;
      spy.mockRestore();
    }
  });
  it("returns only failed SQS record IDs and deduplicates the valid record (local handler)", async () => {
    const event = {
      id: randomUUID(),
      type: "STATUS_CHANGED",
      payload: { incidentId, status: "RESOLVED" },
    };
    const result = await queueHandler({
      Records: [
        { messageId: "good", body: JSON.stringify(event) },
        { messageId: "bad", body: "invalid-json" },
      ],
    });
    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: "bad" }] });
    await queueHandler({
      Records: [{ messageId: "good-again", body: JSON.stringify(event) }],
    });
    expect(
      (
        await pool.query(
          "SELECT count(*) n FROM processed_events WHERE id=$1",
          [event.id],
        )
      ).rows[0].n,
    ).toBe("1");
  });
  it("returns unavailable readiness on database failure without exposing details", async () => {
    const spy = vi
      .spyOn(pool, "query")
      .mockRejectedValueOnce(
        new Error("sensitive connection details") as never,
      );
    try {
      const response = await request(app)
        .get("/api/v1/health/ready")
        .expect(503);
      expect(response.body).toEqual({ status: "unavailable" });
    } finally {
      spy.mockRestore();
    }
  });
  it("revokes sessions after changing authority scope and refuses admin self-modification", async () => {
    const change = {
      departmentId: authority.user.department_id,
      jurisdictionId: authority.user.jurisdiction_id,
      permissions: [],
    };
    await admin.agent
      .patch(`/api/v1/admin/users/${admin.user.id}/organization`)
      .set("Origin", origin)
      .set("X-CSRF-Token", admin.csrf)
      .send(change)
      .expect(403);
    await admin.agent
      .patch(`/api/v1/admin/users/${authority.user.id}/organization`)
      .set("Origin", origin)
      .set("X-CSRF-Token", admin.csrf)
      .send(change)
      .expect(200);
    await authority.agent.get("/api/v1/incidents").expect(401);
    authority = await login("authority");
    const id = await report();
    await post(authority, `/incidents/${id}/status`, {
      status: "ACKNOWLEDGED",
    }).expect(403);
    await admin.agent
      .patch(`/api/v1/admin/users/${authority.user.id}/organization`)
      .set("Origin", origin)
      .set("X-CSRF-Token", admin.csrf)
      .send({ ...change, permissions: ["DISPATCH", "ANNOUNCE"] })
      .expect(200);
    authority = await login("authority");
    await citizen.agent.get("/api/v1/admin/notification-config").expect(403);
    const configuration = await admin.agent
      .get("/api/v1/admin/notification-config")
      .expect(200);
    expect(configuration.body.smsEnabled).toBe(false);
  });
  it("renews local sessions and revokes suspended users immediately", async () => {
    await pool.query(
      "UPDATE sessions SET access_expires=now()-interval '1 second' WHERE user_id=$1",
      [citizen.user.id],
    );
    await citizen.agent.get("/api/v1/auth/me").expect(200);
    await post(admin, `/admin/users/${citizen.user.id}/status`, {
      status: "SUSPENDED",
    }).expect(200);
    await citizen.agent.get("/api/v1/incidents").expect(401);
    await post(admin, `/admin/users/${admin.user.id}/status`, {
      status: "SUSPENDED",
    }).expect(403);
  });
  it("logout stops location sharing and invalidates the cookie", async () => {
    const s = await post(rescuer, "/locations/sessions", { teamId }).expect(
      201,
    );
    await post(rescuer, "/auth/logout", {}).expect(200);
    expect(
      (
        await pool.query("SELECT active FROM location_sessions WHERE id=$1", [
          s.body.id,
        ])
      ).rows[0].active,
    ).toBe(false);
    await rescuer.agent.get("/api/v1/auth/me").expect(401);
  });
});
