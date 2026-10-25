import { Router } from "express";
import { z } from "zod";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminUserGlobalSignOutCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { pool, transaction, audit } from "./db.js";
import { requireRole, permission, fail, page } from "./http.js";
import { teamAccess, incidentAccess, scopeSQL, scopeParams } from "./policy.js";
import { config } from "./config.js";
import { management } from "./management.js";
export const operations = Router();
operations.get("/resource-locations", async (req, res) => {
  res.json({
    items: (
      await pool.query(
        `SELECT r.id,r.name,r.type,r.address,r.quantity,r.status,r.publicly_listed,ST_Y(r.location::geometry) latitude,ST_X(r.location::geometry) longitude,coalesce((SELECT sum(quantity)::int FROM resource_allocations a WHERE a.resource_id=r.id AND released_at IS NULL),0) allocated FROM resources r WHERE r.location IS NOT NULL AND (r.publicly_listed OR $1='ADMIN' OR ($1='AUTHORITY' AND r.department_id=$2 AND r.jurisdiction_id=$3) OR ($1='RESCUER' AND EXISTS(SELECT 1 FROM team_memberships WHERE team_id=r.team_id AND user_id=$4))) ORDER BY r.name LIMIT 100`,
        [
          req.user.role,
          req.user.department_id,
          req.user.jurisdiction_id,
          req.user.id,
        ],
      )
    ).rows,
  });
});
const uuid = z.string().uuid();
const cognito = new CognitoIdentityProviderClient({
  region: config.AWS_REGION,
});
operations.get("/catalog", async (_req, res) => {
  const [departments, categories, jurisdictions] = await Promise.all([
    pool.query("SELECT * FROM departments ORDER BY name"),
    pool.query("SELECT code,label FROM categories ORDER BY label"),
    pool.query("SELECT id,name FROM jurisdictions ORDER BY name"),
  ]);
  res.json({
    departments: departments.rows,
    categories: categories.rows,
    jurisdictions: jurisdictions.rows,
  });
});
operations.get("/situation", async (_req, res) =>
  res.json({
    items: (
      await pool.query(
        `SELECT c.label,i.severity,i.status,date_trunc('hour',i.created_at) reported_at,round(ST_Y(i.location::geometry)::numeric,2) latitude,round(ST_X(i.location::geometry)::numeric,2) longitude FROM incidents i JOIN categories c ON c.code=i.category WHERE i.published AND NOT c.sensitive AND i.created_at>now()-interval '7 days' ORDER BY i.created_at DESC LIMIT 50`,
      )
    ).rows,
  }),
);
operations.patch("/users/me", async (req, res) => {
  const b = z
    .object({ name: z.string().min(2).max(100) })
    .strict()
    .parse(req.body);
  await pool.query("UPDATE user_profiles SET name=$2 WHERE id=$1", [
    req.user.id,
    b.name,
  ]);
  res.json({ ok: true });
});
operations.get(
  "/teams",
  requireRole("ADMIN", "AUTHORITY", "RESCUER"),
  async (req, res) =>
    res.json({
      items: (
        await pool.query(
          `SELECT t.id,t.name,t.department_id,t.jurisdiction_id,t.availability,t.capacity,t.vehicle,d.name department,ARRAY(SELECT capability FROM team_capabilities WHERE team_id=t.id) capabilities FROM rescue_teams t JOIN departments d ON d.id=t.department_id WHERE ($1='ADMIN' OR ($1='AUTHORITY' AND t.department_id=$2 AND t.jurisdiction_id=$3) OR ($1='RESCUER' AND EXISTS(SELECT 1 FROM team_memberships WHERE team_id=t.id AND user_id=$4))) ORDER BY t.name LIMIT 100`,
          [
            req.user.role,
            req.user.department_id,
            req.user.jurisdiction_id,
            req.user.id,
          ],
        )
      ).rows,
    }),
);
operations.post(
  "/teams/:id/duty",
  requireRole("RESCUER", "AUTHORITY", "ADMIN"),
  async (req, res) => {
    const b = z
      .object({
        availability: z.enum(["AVAILABLE", "OFF_DUTY", "UNAVAILABLE"]),
      })
      .strict()
      .parse(req.body);
    await transaction(async (db) => {
      if (req.user.role === "AUTHORITY") permission(req, "DISPATCH");
      const t = await teamAccess(db, req.user, uuid.parse(req.params.id));
      await db.query("SELECT id FROM rescue_teams WHERE id=$1 FOR UPDATE", [
        t.id,
      ]);
      if (
        b.availability === "AVAILABLE" &&
        t.organization_id &&
        !(
          await db.query("SELECT 1 FROM organizations WHERE id=$1 AND active", [
            t.organization_id,
          ])
        ).rowCount
      )
        fail(
          409,
          "ORGANIZATION_INACTIVE",
          "The team's organization is inactive",
        );
      await db.query("UPDATE rescue_teams SET availability=$2 WHERE id=$1", [
        t.id,
        b.availability,
      ]);
      if (b.availability !== "AVAILABLE")
        await db.query(
          "UPDATE location_sessions SET active=false,stopped_at=now() WHERE team_id=$1 AND active",
          [t.id],
        );
      await audit(db, req.user.id, "TEAM_AVAILABILITY", "team", t.id, b);
    });
    res.json({ ok: true });
  },
);
operations.post(
  "/teams/:id/assistance",
  requireRole("RESCUER"),
  async (req, res) => {
    const { incidentId } = z.object({ incidentId: uuid }).parse(req.body);
    await transaction(async (db) => {
      await teamAccess(db, req.user, uuid.parse(req.params.id));
      await incidentAccess(db, req.user, incidentId, true);
      await db.query(
        "INSERT INTO escalation_executions(incident_id,stage,due_at,force_review) SELECT $1,coalesce(max(stage)+1,0),now(),true FROM escalation_executions WHERE incident_id=$1",
        [incidentId],
      );
      await audit(
        db,
        req.user.id,
        "ASSISTANCE_REQUESTED",
        "incident",
        incidentId,
      );
    });
    res.json({ scheduled: true });
  },
);
operations.get("/announcements", async (req, res) =>
  res.json({
    items: (
      await pool.query(
        `SELECT a.*,u.name issuer FROM announcements a JOIN user_profiles u ON u.id=a.author_id WHERE a.expires_at>now() AND a.cancelled_at IS NULL AND (a.audience='EVERYONE' OR ($1='ADMIN') OR ($1='AUTHORITY' AND a.department_id=$2 AND a.jurisdiction_id=$3)) ORDER BY CASE importance WHEN 'URGENT' THEN 0 WHEN 'IMPORTANT' THEN 1 ELSE 2 END,a.created_at DESC LIMIT 100`,
        [req.user.role, req.user.department_id, req.user.jurisdiction_id],
      )
    ).rows,
  }),
);
const announcement = z
  .object({
    title: z.string().min(3).max(150),
    body: z.string().min(5).max(3000),
    audience: z.enum(["EVERYONE", "AUTHORITIES_ONLY"]),
    importance: z.enum(["URGENT", "IMPORTANT", "INFORMATION"]),
    expiresAt: z.iso.datetime(),
  })
  .strict();
operations.post(
  "/announcements",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) => {
    permission(req, "ANNOUNCE");
    const b = announcement.parse(req.body);
    if (Date.parse(b.expiresAt) <= Date.now())
      fail(400, "EXPIRY", "Expiry must be in the future");
    res.status(201).json(
      await transaction(async (db) => {
        const a = (
          await db.query(
            "INSERT INTO announcements(author_id,department_id,jurisdiction_id,title,body,audience,importance,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            [
              req.user.id,
              req.user.department_id,
              req.user.jurisdiction_id,
              b.title,
              b.body,
              b.audience,
              b.importance,
              b.expiresAt,
            ],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO announcement_revisions(announcement_id,actor_id,title,body) VALUES($1,$2,$3,$4)",
          [a.id, req.user.id, b.title, b.body],
        );
        await audit(
          db,
          req.user.id,
          "ANNOUNCEMENT_PUBLISHED",
          "announcement",
          a.id,
        );
        return a;
      }),
    );
  },
);
operations.patch(
  "/announcements/:id",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) => {
    permission(req, "ANNOUNCE");
    const b = announcement
      .extend({ cancelled: z.boolean().default(false) })
      .parse(req.body);
    if (!b.cancelled && Date.parse(b.expiresAt) <= Date.now())
      fail(400, "EXPIRY", "Expiry must be in the future");
    await transaction(async (db) => {
      const a = (
        await db.query("SELECT * FROM announcements WHERE id=$1 FOR UPDATE", [
          uuid.parse(req.params.id),
        ])
      ).rows[0];
      if (
        !a ||
        (req.user.role !== "ADMIN" &&
          (a.department_id !== req.user.department_id ||
            a.jurisdiction_id !== req.user.jurisdiction_id))
      )
        fail(404, "NOT_FOUND", "Announcement not found");
      await db.query(
        "UPDATE announcements SET title=$2,body=$3,audience=$4,importance=$5,expires_at=$6,cancelled_at=CASE WHEN $7 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1",
        [
          a.id,
          b.title,
          b.body,
          b.audience,
          b.importance,
          b.expiresAt,
          b.cancelled,
        ],
      );
      await db.query(
        "INSERT INTO announcement_revisions(announcement_id,actor_id,title,body) VALUES($1,$2,$3,$4)",
        [a.id, req.user.id, b.title, b.body],
      );
      await audit(
        db,
        req.user.id,
        "ANNOUNCEMENT_REVISED",
        "announcement",
        a.id,
      );
    });
    res.json({ ok: true });
  },
);
operations.get("/notifications", async (req, res) =>
  res.json({
    items: (
      await pool.query(
        "SELECT id,incident_id,channel,status,read_at,created_at FROM notification_jobs WHERE recipient_id=$1 ORDER BY created_at DESC LIMIT 50",
        [req.user.id],
      )
    ).rows,
  }),
);
operations.post("/notifications/:id/read", async (req, res) => {
  await pool.query(
    "UPDATE notification_jobs SET read_at=now() WHERE id=$1 AND recipient_id=$2",
    [uuid.parse(req.params.id), req.user.id],
  );
  res.json({ ok: true });
});
operations.get(
  "/resources",
  requireRole("ADMIN", "AUTHORITY", "RESCUER"),
  async (req, res) =>
    res.json({
      items: (
        await pool.query(
          `SELECT r.*,coalesce((SELECT sum(a.quantity) FROM resource_allocations a WHERE a.resource_id=r.id AND a.released_at IS NULL),0)::int allocated FROM resources r WHERE $1='ADMIN' OR ($1='AUTHORITY' AND r.department_id=$2 AND r.jurisdiction_id=$4) OR ($1='RESCUER' AND EXISTS(SELECT 1 FROM team_memberships WHERE team_id=r.team_id AND user_id=$3)) ORDER BY name LIMIT 100`,
          [
            req.user.role,
            req.user.department_id,
            req.user.id,
            req.user.jurisdiction_id,
          ],
        )
      ).rows,
    }),
);
operations.post(
  "/resources/:id/allocate",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) => {
    permission(req, "DISPATCH");
    const b = z
      .object({
        incidentId: uuid,
        quantity: z.number().int().min(1).max(10000),
      })
      .strict()
      .parse(req.body);
    res.status(201).json(
      await transaction(async (db) => {
        const incident = await incidentAccess(db, req.user, b.incidentId, true);
        if (
          ["RESOLVED", "CANCELLED", "DUPLICATE", "UNABLE_TO_RESPOND"].includes(
            incident.status,
          )
        )
          fail(
            409,
            "CLOSED_INCIDENT",
            "Resources cannot be newly allocated to a closed incident",
          );
        const r = (
          await db.query("SELECT * FROM resources WHERE id=$1 FOR UPDATE", [
            uuid.parse(req.params.id),
          ])
        ).rows[0];
        if (
          !r ||
          (req.user.role !== "ADMIN" &&
            (r.department_id !== req.user.department_id ||
              r.jurisdiction_id !== req.user.jurisdiction_id))
        )
          fail(404, "NOT_FOUND", "Resource not found");
        const used = Number(
          (
            await db.query(
              "SELECT coalesce(sum(quantity),0) n FROM resource_allocations WHERE resource_id=$1 AND released_at IS NULL",
              [r.id],
            )
          ).rows[0].n,
        );
        if (r.status !== "AVAILABLE" || used + b.quantity > r.quantity)
          fail(409, "CAPACITY", "Insufficient available resources");
        const a = (
          await db.query(
            "INSERT INTO resource_allocations(resource_id,incident_id,quantity) VALUES($1,$2,$3) RETURNING id",
            [r.id, b.incidentId, b.quantity],
          )
        ).rows[0];
        await audit(db, req.user.id, "RESOURCE_ALLOCATED", "resource", r.id, {
          quantity: b.quantity,
          incidentId: b.incidentId,
        });
        return a;
      }),
    );
  },
);
operations.post(
  "/resources/allocations/:id/release",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) => {
    permission(req, "DISPATCH");
    await transaction(async (db) => {
      const a = (
        await db.query(
          "SELECT a.*,r.department_id,r.jurisdiction_id FROM resource_allocations a JOIN resources r ON r.id=a.resource_id WHERE a.id=$1 FOR UPDATE OF a",
          [uuid.parse(req.params.id)],
        )
      ).rows[0];
      if (
        !a ||
        (req.user.role !== "ADMIN" &&
          (a.department_id !== req.user.department_id ||
            a.jurisdiction_id !== req.user.jurisdiction_id))
      )
        fail(404, "NOT_FOUND", "Allocation not found");
      await incidentAccess(db, req.user, a.incident_id);
      await db.query(
        "UPDATE resource_allocations SET released_at=coalesce(released_at,now()) WHERE id=$1",
        [a.id],
      );
      await audit(
        db,
        req.user.id,
        "RESOURCE_RELEASED",
        "resource",
        a.resource_id,
      );
    });
    res.json({ ok: true });
  },
);
operations.get(
  "/metrics",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) =>
    res.json({
      incidents: (
        await pool.query(
          `SELECT i.status,count(*)::int count FROM incidents i WHERE ${scopeSQL} GROUP BY i.status`,
          scopeParams(req.user),
        )
      ).rows,
    }),
);
operations.get(
  "/incidents/:id/resource-allocations",
  requireRole("AUTHORITY", "ADMIN"),
  async (req, res) =>
    res.json(
      await transaction(async (db) => {
        const i = await incidentAccess(db, req.user, uuid.parse(req.params.id));
        return {
          items: (
            await db.query(
              "SELECT a.id,a.resource_id,r.name,a.quantity,a.created_at,a.released_at FROM resource_allocations a JOIN resources r ON r.id=a.resource_id WHERE a.incident_id=$1 AND ($2='ADMIN' OR (r.department_id=$3 AND r.jurisdiction_id=$4)) ORDER BY a.created_at DESC LIMIT 100",
              [
                i.id,
                req.user.role,
                req.user.department_id,
                req.user.jurisdiction_id,
              ],
            )
          ).rows,
        };
      }),
    ),
);

operations.use("/admin", requireRole("ADMIN"));
operations.use("/admin", management);
operations.get("/admin/users", async (req, res) => {
  const p = page(req);
  res.json({
    items: (
      await pool.query(
        "SELECT id,name,email,role,status,department_id,jurisdiction_id,supervisor_id,ARRAY(SELECT permission FROM user_permissions WHERE user_id=user_profiles.id) permissions,(SELECT team_id FROM team_memberships WHERE user_id=user_profiles.id) team_id FROM user_profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        [p.limit, p.offset],
      )
    ).rows,
  });
});
operations.post("/admin/users", async (req, res) => {
  const b = z
    .object({
      email: z.email().transform((v) => v.trim().toLowerCase()),
      name: z.string().min(2).max(100),
      role: z.enum(["AUTHORITY", "RESCUER"]),
      departmentId: uuid,
      jurisdictionId: uuid,
      teamId: uuid.optional(),
      permissions: z
        .array(z.enum(["DISPATCH", "ANNOUNCE"]))
        .max(2)
        .default([]),
    })
    .strict()
    .parse(req.body);
  if (b.role === "RESCUER" && b.permissions.length)
    fail(
      400,
      "ROLE_PERMISSIONS",
      "Rescue accounts cannot receive dispatcher permissions",
    );
  if (b.role === "AUTHORITY" && b.teamId)
    fail(400, "ROLE_TEAM", "Only rescue accounts can join a team");
  if (!config.COGNITO_POOL_ID)
    fail(
      503,
      "IDENTITY_UNCONFIGURED",
      "Configure Cognito to send account invitations",
    );
  if (b.role === "RESCUER" && !b.teamId)
    fail(400, "TEAM_REQUIRED", "A rescue account must belong to a team");
  await transaction(async (db) => {
    if (
      !(
        await db.query("SELECT 1 FROM departments WHERE id=$1", [
          b.departmentId,
        ])
      ).rowCount ||
      !(
        await db.query("SELECT 1 FROM jurisdictions WHERE id=$1", [
          b.jurisdictionId,
        ])
      ).rowCount
    )
      fail(400, "ORGANIZATION", "Invalid department or jurisdiction");
    if (
      b.teamId &&
      !(
        await db.query(
          "SELECT 1 FROM rescue_teams WHERE id=$1 AND department_id=$2 AND jurisdiction_id=$3",
          [b.teamId, b.departmentId, b.jurisdictionId],
        )
      ).rowCount
    )
      fail(400, "TEAM", "Team does not match organization");
  });
  let created;
  try {
    created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: config.COGNITO_POOL_ID,
        Username: b.email,
        UserAttributes: [
          { Name: "email", Value: b.email },
          { Name: "name", Value: b.name },
          // Cognito generates and emails the temporary password; first sign-in proves inbox access.
          { Name: "email_verified", Value: "true" },
        ],
        DesiredDeliveryMediums: ["EMAIL"],
      }),
    );
  } catch (error) {
    if ((error as Error).name === "UsernameExistsException")
      fail(
        409,
        "IDENTITY_EXISTS",
        "This identity already exists. Use the existing operational account's resend invitation or password recovery; do not create a duplicate.",
      );
    throw error;
  }
  const sub = created.User?.Attributes?.find((a) => a.Name === "sub")?.Value;
  if (!sub)
    fail(
      502,
      "IDENTITY_ERROR",
      "Identity provider did not return an account identifier",
    );
  res.status(201).json(
    await transaction(async (db) => {
      const u = (
        await db.query(
          "INSERT INTO user_profiles(cognito_sub,email,name,role,department_id,jurisdiction_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [sub, b.email, b.name, b.role, b.departmentId, b.jurisdictionId],
        )
      ).rows[0];
      if (b.teamId)
        await db.query(
          "INSERT INTO team_memberships(team_id,user_id) VALUES($1,$2)",
          [b.teamId, u.id],
        );
      for (const p of b.permissions)
        await db.query("INSERT INTO user_permissions VALUES($1,$2)", [u.id, p]);
      await audit(db, req.user.id, "ACCOUNT_PROVISIONED", "user", u.id, {
        role: b.role,
      });
      return u;
    }),
  );
});
operations.post("/admin/users/:id/status", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = z
    .object({ status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]) })
    .strict()
    .parse(req.body);
  if (id === req.user.id)
    fail(403, "SELF_MODIFICATION", "You cannot change your own account status");
  const u = await transaction(async (db) => {
    const u = (
      await db.query(
        "SELECT * FROM user_profiles WHERE id=$1 AND role<>$2 FOR UPDATE",
        [id, "ADMIN"],
      )
    ).rows[0];
    if (!u) fail(404, "NOT_FOUND", "Managed account not found");
    await db.query(
      "UPDATE user_profiles SET status=$2,session_version=session_version+1 WHERE id=$1",
      [id, b.status],
    );
    await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    await db.query(
      "UPDATE location_sessions SET active=false,stopped_at=now() WHERE user_id=$1 AND active",
      [id],
    );
    await audit(db, req.user.id, "ACCOUNT_STATUS", "user", id, b);
    return u;
  });
  let identitySynced = !config.COGNITO_POOL_ID;
  if (config.COGNITO_POOL_ID)
    try {
      if (b.status === "ACTIVE")
        await cognito.send(
          new AdminEnableUserCommand({
            UserPoolId: config.COGNITO_POOL_ID,
            Username: u.cognito_sub,
          }),
        );
      else {
        await cognito.send(
          new AdminDisableUserCommand({
            UserPoolId: config.COGNITO_POOL_ID,
            Username: u.cognito_sub,
          }),
        );
        await cognito.send(
          new AdminUserGlobalSignOutCommand({
            UserPoolId: config.COGNITO_POOL_ID,
            Username: u.cognito_sub,
          }),
        );
      }
      identitySynced = true;
    } catch {
      identitySynced = false;
    }
  res.json({
    ok: true,
    identitySynced,
    notice: identitySynced
      ? undefined
      : "Application sessions revoked; Cognito synchronization needs operator retry.",
  });
});
operations.post("/admin/teams", async (req, res) => {
  const b = z
    .object({
      name: z.string().min(2).max(100),
      organizationId: uuid.optional(),
      departmentId: uuid,
      jurisdictionId: uuid,
      capacity: z.number().int().min(1).max(5).default(1),
      vehicle: z.string().max(100).default(""),
      capabilities: z.array(z.string().min(2).max(50)).max(20),
    })
    .strict()
    .parse(req.body);
  res.status(201).json(
    await transaction(async (db) => {
      if (
        b.organizationId &&
        !(
          await db.query(
            "SELECT 1 FROM organizations WHERE id=$1 AND active FOR SHARE",
            [b.organizationId],
          )
        ).rowCount
      )
        fail(400, "ORGANIZATION", "Select an active organization");
      const t = (
        await db.query(
          "INSERT INTO rescue_teams(name,department_id,jurisdiction_id,capacity,vehicle,organization_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [
            b.name,
            b.departmentId,
            b.jurisdictionId,
            b.capacity,
            b.vehicle,
            b.organizationId ?? null,
          ],
        )
      ).rows[0];
      for (const cap of new Set(b.capabilities))
        await db.query(
          "INSERT INTO team_capabilities(team_id,capability) VALUES($1,$2)",
          [t.id, cap],
        );
      await audit(db, req.user.id, "TEAM_CREATED", "team", t.id);
      return t;
    }),
  );
});
operations.post("/admin/departments", async (req, res) => {
  const b = z
    .object({ name: z.string().min(2).max(100) })
    .strict()
    .parse(req.body);
  res.status(201).json(
    await transaction(async (db) => {
      const d = (
        await db.query(
          "INSERT INTO departments(name) VALUES($1) RETURNING id",
          [b.name],
        )
      ).rows[0];
      await audit(db, req.user.id, "DEPARTMENT_CREATED", "department", d.id);
      return d;
    }),
  );
});
operations.put("/admin/categories/:code", async (req, res) => {
  const b = z
    .object({
      label: z.string().min(2).max(100),
      sensitive: z.boolean(),
      departmentIds: z.array(uuid).min(1).max(8),
      requiredCapabilities: z.array(z.string().min(2).max(50)).max(20),
    })
    .strict()
    .parse(req.body);
  const code = z
    .string()
    .regex(/^[A-Z_]{2,60}$/)
    .parse(req.params.code);
  await transaction(async (db) => {
    await db.query(
      "INSERT INTO categories(code,label,sensitive,required_capabilities) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO UPDATE SET label=$2,sensitive=$3,required_capabilities=$4",
      [code, b.label, b.sensitive, b.requiredCapabilities],
    );
    await db.query("DELETE FROM category_departments WHERE category=$1", [
      code,
    ]);
    for (const d of b.departmentIds)
      await db.query("INSERT INTO category_departments VALUES($1,$2)", [
        code,
        d,
      ]);
    await audit(db, req.user.id, "CATEGORY_CONFIGURED", "category", code);
  });
  res.json({ ok: true });
});
operations.get("/admin/policies", async (_req, res) =>
  res.json({
    items: (await pool.query("SELECT * FROM escalation_policies ORDER BY name"))
      .rows,
  }),
);
operations.put("/admin/policies/:id", async (req, res) => {
  const b = z
    .object({
      radii: z.array(z.number().int().min(100).max(100000)).min(1).max(6),
      delays: z.array(z.number().int().min(0).max(86400)).min(1).max(6),
    })
    .strict()
    .refine(
      (b) =>
        b.radii.length === b.delays.length &&
        b.delays[0] === 0 &&
        b.delays.every((n, i) => !i || n > b.delays[i - 1]) &&
        b.radii.every((n, i) => !i || n >= b.radii[i - 1]),
    )
    .parse(req.body);
  await transaction(async (db) => {
    const id = uuid.parse(req.params.id);
    await db.query(
      "UPDATE escalation_policies SET radii_m=$2,delays_seconds=$3 WHERE id=$1",
      [id, b.radii, b.delays],
    );
    await audit(db, req.user.id, "POLICY_CONFIGURED", "policy", id);
  });
  res.json({ ok: true });
});
operations.get("/admin/audit", async (req, res) => {
  const p = page(req);
  res.json({
    items: (
      await pool.query(
        "SELECT * FROM audit_events ORDER BY id DESC LIMIT $1 OFFSET $2",
        [p.limit, p.offset],
      )
    ).rows,
  });
});
operations.get("/admin/health", async (_req, res) =>
  res.json({
    outboxPending: Number(
      (
        await pool.query(
          "SELECT count(*) FROM outbox_events WHERE published_at IS NULL",
        )
      ).rows[0].count,
    ),
    escalationsDue: Number(
      (
        await pool.query(
          "SELECT count(*) FROM escalation_executions WHERE completed_at IS NULL AND due_at<now()",
        )
      ).rows[0].count,
    ),
    notificationProblems: Number(
      (
        await pool.query(
          "SELECT count(*) FROM notification_jobs WHERE status IN('FAILED','UNKNOWN')",
        )
      ).rows[0].count,
    ),
    cognitoConfigured: !!config.COGNITO_POOL_ID,
    smsEnabled: config.SMS_ENABLED === "true",
    evidenceConfigured: !!config.EVIDENCE_BUCKET,
    mapsConfigured: !!config.LOCATION_MAP_NAME,
  }),
);
operations.post("/admin/resources", async (req, res) => {
  const b = z
    .object({
      name: z.string().min(2).max(100),
      type: z.string().min(2).max(50),
      departmentId: uuid,
      jurisdictionId: uuid,
      teamId: uuid.optional(),
      quantity: z.number().int().min(0).max(100000),
    })
    .strict()
    .parse(req.body);
  res.status(201).json(
    await transaction(async (db) => {
      if (
        b.teamId &&
        !(
          await db.query(
            "SELECT 1 FROM rescue_teams WHERE id=$1 AND department_id=$2 AND jurisdiction_id=$3",
            [b.teamId, b.departmentId, b.jurisdictionId],
          )
        ).rowCount
      )
        fail(
          400,
          "TEAM",
          "Resource team must match its department and jurisdiction",
        );
      const r = (
        await db.query(
          "INSERT INTO resources(name,type,department_id,jurisdiction_id,team_id,quantity) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [
            b.name,
            b.type,
            b.departmentId,
            b.jurisdictionId,
            b.teamId ?? null,
            b.quantity,
          ],
        )
      ).rows[0];
      await audit(db, req.user.id, "RESOURCE_CREATED", "resource", r.id);
      return r;
    }),
  );
});
operations.patch("/admin/resources/:id", async (req, res) => {
  const b = z
    .object({
      status: z.enum(["AVAILABLE", "MAINTENANCE", "UNAVAILABLE"]),
      quantity: z.number().int().min(0).max(100000),
    })
    .strict()
    .parse(req.body);
  await transaction(async (db) => {
    const id = uuid.parse(req.params.id);
    await db.query("SELECT id FROM resources WHERE id=$1 FOR UPDATE", [id]);
    const n = Number(
      (
        await db.query(
          "SELECT coalesce(sum(quantity),0) n FROM resource_allocations WHERE resource_id=$1 AND released_at IS NULL",
          [id],
        )
      ).rows[0].n,
    );
    if (n > b.quantity || (n > 0 && b.status !== "AVAILABLE"))
      fail(
        409,
        "ALLOCATED",
        "Release allocated inventory before reducing capacity or taking it offline",
      );
    await db.query("UPDATE resources SET status=$2,quantity=$3 WHERE id=$1", [
      id,
      b.status,
      b.quantity,
    ]);
    await audit(db, req.user.id, "RESOURCE_UPDATED", "resource", id, b);
  });
  res.json({ ok: true });
});
operations.post("/admin/jurisdictions", async (req, res) => {
  const b = z
    .object({
      name: z.string().min(2).max(100),
      west: z.number().min(-180).max(180),
      south: z.number().min(-90).max(90),
      east: z.number().min(-180).max(180),
      north: z.number().min(-90).max(90),
    })
    .strict()
    .refine((v) => v.west < v.east && v.south < v.north)
    .parse(req.body);
  res.status(201).json(
    await transaction(async (db) => {
      const j = (
        await db.query(
          "INSERT INTO jurisdictions(name,boundary) VALUES($1,ST_Multi(ST_MakeEnvelope($2,$3,$4,$5,4326))) RETURNING id",
          [b.name, b.west, b.south, b.east, b.north],
        )
      ).rows[0];
      await audit(
        db,
        req.user.id,
        "JURISDICTION_CREATED",
        "jurisdiction",
        j.id,
      );
      return j;
    }),
  );
});
operations.post("/admin/notifications/:id/retry", async (req, res) => {
  await transaction(async (db) => {
    const id = uuid.parse(req.params.id);
    const job = (
      await db.query("SELECT * FROM notification_jobs WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!job || job.status !== "FAILED")
      fail(
        409,
        "UNSAFE_RETRY",
        "Only definitively failed notifications may be retried; reconcile unknown submissions with the provider",
      );
    const count = Number(
      (
        await db.query(
          "SELECT count(*) n FROM notification_attempts WHERE job_id=$1 AND outcome='SENDING'",
          [id],
        )
      ).rows[0].n,
    );
    if (count >= 3) fail(409, "RETRY_LIMIT", "Retry limit reached");
    await db.query(
      "UPDATE notification_jobs SET status='PENDING' WHERE id=$1",
      [id],
    );
    await audit(db, req.user.id, "NOTIFICATION_RETRY", "notification", id);
  });
  res.json({ queued: true });
});
operations.get("/admin/notification-config", async (_req, res) =>
  res.json({
    smsEnabled: config.SMS_ENABLED === "true",
    recipients: (
      await pool.query(
        "SELECT id,name,role,sms_enabled,CASE WHEN phone IS NULL THEN false ELSE true END phone_configured FROM user_profiles WHERE role IN('AUTHORITY','RESCUER') ORDER BY name LIMIT 100",
      )
    ).rows,
  }),
);
operations.patch("/admin/users/:id/organization", async (req, res) => {
  const b = z
    .object({
      departmentId: uuid,
      jurisdictionId: uuid,
      teamId: uuid.optional(),
      supervisorId: uuid.nullable().optional(),
      permissions: z.array(z.enum(["DISPATCH", "ANNOUNCE"])).max(2),
    })
    .strict()
    .parse(req.body);
  await transaction(async (db) => {
    const id = uuid.parse(req.params.id);
    if (id === req.user.id)
      fail(403, "SELF_MODIFICATION", "Cannot change your own privileges");
    const u = (
      await db.query(
        "SELECT * FROM user_profiles WHERE id=$1 AND role IN('AUTHORITY','RESCUER') FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!u) fail(404, "NOT_FOUND", "Operational account not found");
    if (u.role === "RESCUER" && !b.teamId)
      fail(400, "TEAM_REQUIRED", "A rescue account requires a team");
    if (
      b.teamId &&
      !(
        await db.query(
          "SELECT 1 FROM rescue_teams WHERE id=$1 AND department_id=$2 AND jurisdiction_id=$3",
          [b.teamId, b.departmentId, b.jurisdictionId],
        )
      ).rowCount
    )
      fail(
        400,
        "TEAM",
        "Team must match the selected department and jurisdiction",
      );
    if (
      b.supervisorId &&
      (b.supervisorId === id ||
        !(
          await db.query(
            "SELECT 1 FROM user_profiles WHERE id=$1 AND role IN('AUTHORITY','ADMIN') AND status='ACTIVE'",
            [b.supervisorId],
          )
        ).rowCount)
    )
      fail(
        400,
        "SUPERVISOR",
        "Supervisor must be an active authority or administrator",
      );
    if (u.role === "RESCUER" && b.permissions.length)
      fail(
        400,
        "ROLE_PERMISSIONS",
        "Rescue accounts cannot receive dispatcher permissions",
      );
    await db.query(
      "UPDATE user_profiles SET department_id=$2,jurisdiction_id=$3,supervisor_id=$4,session_version=session_version+1 WHERE id=$1",
      [id, b.departmentId, b.jurisdictionId, b.supervisorId ?? null],
    );
    await db.query("DELETE FROM user_permissions WHERE user_id=$1", [id]);
    for (const p of new Set(b.permissions))
      await db.query("INSERT INTO user_permissions VALUES($1,$2)", [id, p]);
    await db.query("DELETE FROM team_memberships WHERE user_id=$1", [id]);
    if (u.role === "RESCUER")
      await db.query(
        "INSERT INTO team_memberships(team_id,user_id) VALUES($1,$2)",
        [b.teamId, id],
      );
    await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    await db.query(
      "UPDATE location_sessions SET active=false,stopped_at=now() WHERE user_id=$1 AND active",
      [id],
    );
    await audit(db, req.user.id, "ACCOUNT_SCOPE_CHANGED", "user", id, {
      departmentId: b.departmentId,
      jurisdictionId: b.jurisdictionId,
      permissions: b.permissions,
    });
  });
  res.json({ ok: true, notice: "Scope updated; prior sessions revoked." });
});
