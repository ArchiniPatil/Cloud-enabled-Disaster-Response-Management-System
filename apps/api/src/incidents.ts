import { Router } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  incidentSchema,
  canTransition,
  statuses,
  terminalAssignments,
} from "../../../packages/core/src/domain.js";
import { pool, transaction, audit, outbox, type DB } from "./db.js";
import { fail, requireRole, permission, page, type User } from "./http.js";
import {
  scopeSQL,
  scopeParams,
  incidentAccess,
  eligibleTeams,
  teamAccess,
} from "./policy.js";
import {
  incidentQuery,
  activeSQL,
  assignedSQL,
  overdueSQL,
} from "./incident-query.js";
export const incidentRouter = Router();
const uuid = z.string().uuid();
export async function recordTransition(
  db: DB,
  id: string,
  from: string,
  to: string,
  actor: string | null,
  note = "",
) {
  await db.query(
    "UPDATE incidents SET status=$2,updated_at=now() WHERE id=$1",
    [id, to],
  );
  await db.query(
    "INSERT INTO incident_status_history(incident_id,actor_id,from_status,to_status,note) VALUES($1,$2,$3,$4,$5)",
    [id, actor, from, to, note],
  );
  await audit(db, actor, "INCIDENT_STATUS", "incident", id, { from, to });
  await outbox(
    db,
    "STATUS_CHANGED",
    { incidentId: id, status: to },
    `status:${id}:${crypto.randomUUID()}`,
  );
}
export async function notifyControl(
  db: DB,
  id: string,
  stage: number | string,
) {
  await db.query(
    `INSERT INTO notification_jobs(incident_id,recipient_id,channel,dedupe_key,status) SELECT i.id,u.id,'IN_APP',$2||':'||u.id,'AVAILABLE' FROM incidents i JOIN incident_departments d ON d.incident_id=i.id JOIN user_profiles u ON u.department_id=d.department_id AND u.role='AUTHORITY' AND u.status='ACTIVE' JOIN jurisdictions j ON j.id=u.jurisdiction_id WHERE i.id=$1 AND ST_Covers(j.boundary,i.location::geometry) ON CONFLICT(dedupe_key) DO NOTHING`,
    [id, `control:${id}:${stage}`],
  );
}
export async function idempotent<T>(
  db: DB,
  u: User,
  key: string,
  body: unknown,
  fn: () => Promise<T>,
) {
  const digest = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `${u.id}:${key}`,
  ]);
  const old = (
    await db.query(
      "SELECT * FROM idempotency_keys WHERE actor_id=$1 AND key=$2",
      [u.id, key],
    )
  ).rows[0];
  if (old) {
    if (old.request_hash !== digest)
      fail(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This key was already used for another request",
      );
    return old.response as T;
  }
  const result = await fn();
  await db.query(
    "INSERT INTO idempotency_keys(actor_id,key,request_hash,response) VALUES($1,$2,$3,$4)",
    [u.id, key, digest, JSON.stringify(result)],
  );
  return result;
}
incidentRouter.get("/", async (req, res) => {
  const p = page(req),
    q = incidentQuery(req);
  const [rows, total] = await Promise.all([
    pool.query(
      `SELECT i.id,i.category,c.label,i.severity,i.status,i.kind,i.created_at,i.escalation_state,i.address,
      ST_Y(i.location::geometry) latitude,ST_X(i.location::geometry) longitude,
      ${overdueSQL} overdue,
      coalesce((SELECT json_agg(json_build_object('id',a.id,'name',t.name,'status',a.status)) FROM incident_assignments a JOIN rescue_teams t ON t.id=a.team_id WHERE a.incident_id=i.id AND a.status NOT IN('COMPLETED','DECLINED','CANCELLED')),'[]') assigned_teams
      FROM incidents i JOIN categories c ON c.code=i.category WHERE ${q.where} ORDER BY ${q.sort} LIMIT $${q.params.length + 1} OFFSET $${q.params.length + 2}`,
      [...q.params, p.limit, p.offset],
    ),
    pool.query(
      `SELECT count(*)::int total FROM incidents i WHERE ${q.where}`,
      q.params,
    ),
  ]);
  res.json({
    items: rows.rows,
    total: total.rows[0].total,
    ...p,
    asOf: new Date().toISOString(),
  });
});
incidentRouter.get("/summary", async (req, res) => {
  const q = incidentQuery(req);
  const result = await pool.query(
    `SELECT count(*)::int total,
    count(*) FILTER(WHERE ${activeSQL})::int active,
    count(*) FILTER(WHERE ${activeSQL} AND i.severity='CRITICAL')::int critical,
    count(*) FILTER(WHERE ${activeSQL} AND NOT ${assignedSQL})::int unassigned,
    count(*) FILTER(WHERE ${activeSQL} AND i.severity='CRITICAL' AND NOT ${assignedSQL})::int critical_unassigned,
    count(*) FILTER(WHERE ${overdueSQL})::int overdue,
    count(*) FILTER(WHERE i.status='RESOLVED')::int resolved FROM incidents i WHERE ${q.where}`,
    q.params,
  );
  res.json({ ...result.rows[0], asOf: new Date().toISOString() });
});
incidentRouter.get("/activity", async (req, res) => {
  const q = incidentQuery(req);
  const result = await pool.query(
    `SELECT h.id,h.incident_id,h.to_status,h.created_at,i.category FROM incident_status_history h JOIN incidents i ON i.id=h.incident_id WHERE ${q.where} ORDER BY h.created_at DESC,h.id DESC LIMIT 12`,
    q.params,
  );
  res.json({ items: result.rows });
});
incidentRouter.post("/", requireRole("CITIZEN"), async (req, res) => {
  const input = incidentSchema.parse(req.body);
  const key = z.string().min(8).max(120).parse(req.get("idempotency-key"));
  const result = await transaction((db) =>
    idempotent(db, req.user, key, input, async () => {
      if (
        !(
          await db.query("SELECT 1 FROM categories WHERE code=$1", [
            input.category,
          ])
        ).rowCount
      )
        fail(400, "CATEGORY", "Unknown incident category");
      const i = (
        await db.query(
          `INSERT INTO incidents(reporter_id,category,severity,kind,description,address,location,policy_id,people_affected,hazards,location_accuracy_m) VALUES($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7,$8),4326)::geography,(SELECT id FROM escalation_policies WHERE active ORDER BY name LIMIT 1),$9,$10,$11) RETURNING id,status`,
          [
            req.user.id,
            input.category,
            input.severity,
            input.kind,
            input.description,
            input.address,
            input.longitude,
            input.latitude,
            input.peopleAffected ?? null,
            input.hazards,
            input.locationAccuracyM ?? null,
          ],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO incident_departments SELECT $1,department_id FROM category_departments WHERE category=$2",
        [i.id, input.category],
      );
      await db.query(
        "INSERT INTO incident_status_history(incident_id,actor_id,to_status) VALUES($1,$2,'SUBMITTED')",
        [i.id, req.user.id],
      );
      await notifyControl(db, i.id, 0);
      await db.query(
        "INSERT INTO escalation_executions(incident_id,stage,due_at) SELECT $1,0,now() WHERE EXISTS(SELECT 1 FROM incidents WHERE id=$1 AND policy_id IS NOT NULL)",
        [i.id],
      );
      await outbox(
        db,
        "INCIDENT_CREATED",
        { incidentId: i.id },
        `incident:${i.id}`,
      );
      await audit(db, req.user.id, "INCIDENT_CREATED", "incident", i.id);
      return {
        ...i,
        acknowledgement:
          "Saved to this platform. Emergency services have not necessarily accepted this request.",
      };
    }),
  );
  res.status(201).json(result);
});
incidentRouter.get("/:id", async (req, res) =>
  res.json(
    await transaction(async (db) => {
      const i = await incidentAccess(db, req.user, uuid.parse(req.params.id));
      const history = (
        await db.query(
          "SELECT from_status,to_status,note,created_at FROM incident_status_history WHERE incident_id=$1 ORDER BY id",
          [i.id],
        )
      ).rows;
      const assignments = (
        await db.query(
          "SELECT a.id,a.team_id,t.name,d.name department,a.status,a.updated_at FROM incident_assignments a JOIN rescue_teams t ON t.id=a.team_id JOIN departments d ON d.id=t.department_id WHERE a.incident_id=$1 ORDER BY a.created_at",
          [i.id],
        )
      ).rows;
      const evidence = (
        await db.query(
          "SELECT id,content_type,size_bytes,status FROM incident_evidence WHERE incident_id=$1 ORDER BY created_at",
          [i.id],
        )
      ).rows;
      const updates = (
        await db.query(
          "SELECT n.id,n.body,n.created_at,u.role actor_role FROM incident_updates n JOIN user_profiles u ON u.id=n.actor_id WHERE n.incident_id=$1 ORDER BY n.created_at",
          [i.id],
        )
      ).rows;
      return {
        ...i,
        location: undefined,
        history,
        assignments,
        evidence,
        updates,
      };
    }),
  ),
);
incidentRouter.post("/:id/updates", async (req, res) => {
  const { body } = z
    .object({ body: z.string().trim().min(3).max(2000) })
    .strict()
    .parse(req.body);
  const key = z.string().min(8).max(120).parse(req.get("idempotency-key"));
  const result = await transaction(async (db) => {
    const i = await incidentAccess(
      db,
      req.user,
      uuid.parse(req.params.id),
      true,
    );
    if (
      ["RESOLVED", "CANCELLED", "DUPLICATE", "UNABLE_TO_RESPOND"].includes(
        i.status,
      )
    )
      fail(
        409,
        "CLOSED_REPORT",
        "This report is closed; supplementary updates are unavailable",
      );
    return idempotent(
      db,
      req.user,
      key,
      { route: "incident-update", id: i.id, body },
      async () => {
        const row = (
          await db.query(
            "INSERT INTO incident_updates(incident_id,actor_id,body) VALUES($1,$2,$3) RETURNING id,created_at",
            [i.id, req.user.id, body],
          )
        ).rows[0];
        await audit(
          db,
          req.user.id,
          "INCIDENT_UPDATE_ADDED",
          "incident",
          i.id,
          { updateId: row.id },
        );
        await notifyControl(db, i.id, `update-${row.id}`);
        return row;
      },
    );
  });
  res.status(201).json(result);
});
incidentRouter.post("/:id/status", async (req, res) => {
  const { status, note } = z
    .object({ status: z.enum(statuses), note: z.string().max(500).default("") })
    .strict()
    .parse(req.body);
  res.json(
    await transaction(async (db) => {
      const i = await incidentAccess(
        db,
        req.user,
        uuid.parse(req.params.id),
        true,
      );
      if (req.user.role === "CITIZEN") {
        if (
          status !== "CANCELLED" ||
          !["SUBMITTED", "NEEDS_VERIFICATION"].includes(i.status)
        )
          fail(
            403,
            "FORBIDDEN",
            "Only unacknowledged reports can be cancelled",
          );
      } else if (!["ADMIN", "AUTHORITY"].includes(req.user.role))
        fail(403, "FORBIDDEN", "Dispatcher permission required");
      else permission(req, "DISPATCH");
      if (["DISPATCHED", "TEAM_EN_ROUTE", "TEAM_ON_SCENE"].includes(status))
        fail(
          409,
          "USE_ASSIGNMENT",
          "Use the assignment workflow for operational milestones",
        );
      if (!canTransition(i.status, status))
        fail(
          409,
          "INVALID_TRANSITION",
          `Cannot move from ${i.status} to ${status}`,
        );
      if (
        ["RESOLVED", "UNABLE_TO_RESPOND"].includes(status) &&
        note.trim().length < 5
      )
        fail(
          400,
          "OUTCOME_REQUIRED",
          "Record the outcome and any remaining needs before closing the response",
        );
      if (
        ["RESOLVED", "CANCELLED", "DUPLICATE", "UNABLE_TO_RESPOND"].includes(
          status,
        ) &&
        (
          await db.query(
            "SELECT 1 FROM incident_assignments WHERE incident_id=$1 AND status NOT IN('COMPLETED','DECLINED','CANCELLED')",
            [i.id],
          )
        ).rowCount
      )
        fail(
          409,
          "ACTIVE_ASSIGNMENTS",
          "Complete or cancel active assignments first",
        );
      await recordTransition(db, i.id, i.status, status, req.user.id, note);
      if (status === "ACKNOWLEDGED")
        await db.query("UPDATE incidents SET owner_id=$2 WHERE id=$1", [
          i.id,
          req.user.id,
        ]);
      if (status === "REOPENED") {
        await db.query(
          "UPDATE incidents SET response_cycle_started_at=now(),escalation_state='PENDING',owner_id=NULL WHERE id=$1",
          [i.id],
        );
        await db.query(
          "UPDATE escalation_executions SET completed_at=now(),outcome='SUPERSEDED_BY_REOPEN' WHERE incident_id=$1 AND completed_at IS NULL",
          [i.id],
        );
        await db.query(
          "INSERT INTO escalation_executions(incident_id,stage,due_at,policy_stage) SELECT $1,coalesce(max(stage)+1,0),now(),0 FROM escalation_executions WHERE incident_id=$1",
          [i.id],
        );
      }
      return { id: i.id, status };
    }),
  );
});
incidentRouter.get(
  "/:id/eligible-teams",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) =>
    res.json(
      await transaction(async (db) => {
        const i = await incidentAccess(db, req.user, uuid.parse(req.params.id));
        const teams = await eligibleTeams(db, i.id, 25000);
        return {
          items: teams.filter(
            (t) =>
              req.user.role === "ADMIN" ||
              (t.department_id === req.user.department_id &&
                t.jurisdiction_id === req.user.jurisdiction_id),
          ),
        };
      }),
    ),
);
incidentRouter.get(
  "/:id/escalations",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) =>
    res.json(
      await transaction(async (db) => {
        const i = await incidentAccess(db, req.user, uuid.parse(req.params.id));
        return {
          items: (
            await db.query(
              "SELECT stage,due_at,completed_at,outcome FROM escalation_executions WHERE incident_id=$1 ORDER BY stage",
              [i.id],
            )
          ).rows,
        };
      }),
    ),
);
incidentRouter.get(
  "/:id/duplicates",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) =>
    res.json(
      await transaction(async (db) => {
        const i = await incidentAccess(db, req.user, uuid.parse(req.params.id));
        return {
          items: (
            await db.query(
              `SELECT i.id,i.category,i.created_at FROM incidents i WHERE ${scopeSQL} AND i.id<>$5 AND i.category=$6 AND i.created_at>now()-interval '24 hours' AND ST_DWithin(i.location,ST_SetSRID(ST_MakePoint($7,$8),4326)::geography,250) LIMIT 20`,
              [
                ...scopeParams(req.user),
                i.id,
                i.category,
                i.longitude,
                i.latitude,
              ],
            )
          ).rows,
          notice:
            "Candidates require human review; no automatic duplicate classification.",
        };
      }),
    ),
);
incidentRouter.post(
  "/:id/escalate",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) => {
    permission(req, "DISPATCH");
    await transaction(async (db) => {
      const i = await incidentAccess(
        db,
        req.user,
        uuid.parse(req.params.id),
        true,
      );
      await db.query(
        "INSERT INTO escalation_executions(incident_id,stage,due_at,force_review) SELECT $1,coalesce(max(stage)+1,0),now(),true FROM escalation_executions WHERE incident_id=$1",
        [i.id],
      );
      await audit(db, req.user.id, "MANUAL_ESCALATION", "incident", i.id);
    });
    res.json({ scheduled: true });
  },
);
incidentRouter.post(
  "/:id/publish",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) => {
    permission(req, "ANNOUNCE");
    await transaction(async (db) => {
      const i = await incidentAccess(
        db,
        req.user,
        uuid.parse(req.params.id),
        true,
      );
      if (
        (
          await db.query("SELECT sensitive FROM categories WHERE code=$1", [
            i.category,
          ])
        ).rows[0].sensitive
      )
        fail(409, "SENSITIVE", "Sensitive reports cannot be published");
      await db.query("UPDATE incidents SET published=$2 WHERE id=$1", [
        i.id,
        z.boolean().parse(req.body.published),
      ]);
      await audit(db, req.user.id, "PUBLICATION_CHANGED", "incident", i.id);
    });
    res.json({ ok: true });
  },
);
export const assignmentsRouter = Router();
assignmentsRouter.post(
  "/",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) => {
    permission(req, "DISPATCH");
    const b = z
      .object({ incidentId: uuid, teamId: uuid })
      .strict()
      .parse(req.body);
    const key = z.string().min(8).max(120).parse(req.get("idempotency-key"));
    res.status(201).json(
      await transaction((db) =>
        idempotent(
          db,
          req.user,
          key,
          { route: "assignment", ...b },
          async () => {
            const i = await incidentAccess(db, req.user, b.incidentId, true);
            if (
              ![
                "ACKNOWLEDGED",
                "DISPATCHED",
                "TEAM_EN_ROUTE",
                "TEAM_ON_SCENE",
              ].includes(i.status)
            )
              fail(
                409,
                "ACKNOWLEDGE_FIRST",
                "Acknowledge the incident before assigning a team",
              );
            await teamAccess(db, req.user, b.teamId);
            await db.query(
              "SELECT id FROM rescue_teams WHERE id=$1 FOR UPDATE",
              [b.teamId],
            );
            if (
              !(await eligibleTeams(db, i.id, 100000)).some(
                (t) => t.id === b.teamId,
              )
            )
              fail(
                409,
                "INELIGIBLE_TEAM",
                "Team is unavailable, outside the area, stale, or lacks required capability",
              );
            const a = (
              await db.query(
                "INSERT INTO incident_assignments(incident_id,team_id,created_by) VALUES($1,$2,$3) RETURNING *",
                [i.id, b.teamId, req.user.id],
              )
            ).rows[0];
            await audit(
              db,
              req.user.id,
              "ASSIGNMENT_OFFERED",
              "assignment",
              a.id,
            );
            await db.query(
              `INSERT INTO notification_jobs(incident_id,recipient_id,channel,dedupe_key,status) SELECT $1,m.user_id,'IN_APP',$2||':'||m.user_id,'AVAILABLE' FROM team_memberships m WHERE m.team_id=$3 ON CONFLICT DO NOTHING`,
              [i.id, `assignment:${a.id}`, b.teamId],
            );
            return a;
          },
        ),
      ),
    );
  },
);
assignmentsRouter.post("/:id/status", async (req, res) => {
  const b = z
    .object({
      note: z.string().trim().max(1000).default(""),
      status: z.enum([
        "ACCEPTED",
        "DECLINED",
        "DISPATCHED",
        "EN_ROUTE",
        "ARRIVED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ]),
    })
    .strict()
    .parse(req.body);
  res.json(
    await transaction(async (db) => {
      const id = uuid.parse(req.params.id);
      const ref = (
        await db.query(
          "SELECT incident_id FROM incident_assignments WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (!ref) fail(404, "NOT_FOUND", "Assignment not found");
      const i = await incidentAccess(db, req.user, ref.incident_id, true);
      const a = (
        await db.query(
          "SELECT * FROM incident_assignments WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      await teamAccess(db, req.user, a.team_id);
      const dispatcher = ["ADMIN", "AUTHORITY"].includes(req.user.role);
      if (["DISPATCHED", "CANCELLED"].includes(b.status)) {
        if (!dispatcher)
          fail(403, "FORBIDDEN", "Dispatcher authorization required");
        permission(req, "DISPATCH");
      } else if (req.user.role !== "RESCUER")
        fail(403, "FORBIDDEN", "Assigned rescue team must perform this action");
      const { assignmentTransitions } =
        await import("../../../packages/core/src/domain.js");
      if (!assignmentTransitions[a.status]?.includes(b.status))
        fail(409, "INVALID_TRANSITION", "Invalid assignment transition");
      if (
        ["DECLINED", "COMPLETED", "CANCELLED"].includes(b.status) &&
        b.note.length < 5
      )
        fail(
          400,
          "OUTCOME_REQUIRED",
          "Provide a reason or outcome of at least five characters",
        );
      await db.query(
        "UPDATE incident_assignments SET status=$2,outcome_note=$3,updated_at=now() WHERE id=$1",
        [id, b.status, b.note],
      );
      await audit(db, req.user.id, "ASSIGNMENT_STATUS", "assignment", id, {
        from: a.status,
        to: b.status,
        note: b.note,
      });
      const next: Record<string, string> = {
        DISPATCHED: "DISPATCHED",
        EN_ROUTE: "TEAM_EN_ROUTE",
        ARRIVED: "TEAM_ON_SCENE",
      };
      if (
        next[b.status] &&
        canTransition(i.status, next[b.status] as (typeof statuses)[number])
      )
        await recordTransition(db, i.id, i.status, next[b.status], req.user.id);
      if (
        b.status === "COMPLETED" &&
        !(
          await db.query(
            "SELECT 1 FROM incident_assignments WHERE incident_id=$1 AND status NOT IN('COMPLETED','DECLINED','CANCELLED')",
            [i.id],
          )
        ).rowCount &&
        i.status === "TEAM_ON_SCENE"
      )
        await recordTransition(
          db,
          i.id,
          i.status,
          "RESOLVED",
          req.user.id,
          b.note,
        );
      if (["DECLINED", "CANCELLED"].includes(b.status)) {
        await db.query(
          "INSERT INTO escalation_executions(incident_id,stage,due_at,force_review) SELECT $1,coalesce(max(stage)+1,0),now(),true FROM escalation_executions WHERE incident_id=$1",
          [i.id],
        );
      }
      if (terminalAssignments.includes(b.status)) {
        await db.query("DELETE FROM route_cache WHERE assignment_id=$1", [id]);
        if (
          !(
            await db.query(
              "SELECT 1 FROM incident_assignments WHERE team_id=$1 AND status NOT IN('COMPLETED','DECLINED','CANCELLED')",
              [a.team_id],
            )
          ).rowCount
        )
          await db.query(
            "UPDATE location_sessions SET active=false,stopped_at=now() WHERE team_id=$1 AND active",
            [a.team_id],
          );
      }
      return { id, status: b.status };
    }),
  );
});
