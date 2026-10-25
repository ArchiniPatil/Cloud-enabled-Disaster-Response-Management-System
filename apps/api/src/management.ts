import { Router } from "express";
import { z } from "zod";
import { pool, transaction, audit } from "./db.js";
import { fail, requireRole } from "./http.js";
import { config } from "./config.js";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
export const management = Router();
management.use(requireRole("ADMIN"));
const uuid = z.string().uuid();
const activeAssignments = "status NOT IN('COMPLETED','DECLINED','CANCELLED')";
management.patch("/resources/:id/location", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = z
    .object({
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
      address: z.string().max(300),
      publiclyListed: z.boolean(),
    })
    .strict()
    .refine(
      (v) =>
        (v.latitude === null) === (v.longitude === null) &&
        (!v.publiclyListed || v.latitude !== null),
    )
    .parse(req.body);
  await transaction(async (db) => {
    const r = (
      await db.query("SELECT * FROM resources WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!r) fail(404, "NOT_FOUND", "Resource not found");
    if (
      b.latitude !== null &&
      !(
        await db.query(
          "SELECT 1 FROM jurisdictions WHERE id=$1 AND ST_Covers(boundary,ST_SetSRID(ST_MakePoint($2,$3),4326))",
          [r.jurisdiction_id, b.longitude, b.latitude],
        )
      ).rowCount
    )
      fail(
        400,
        "JURISDICTION",
        "Resource location must fall within its operating jurisdiction",
      );
    await db.query(
      "UPDATE resources SET location=CASE WHEN $2::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($3,$2),4326)::geography END,address=$4,publicly_listed=$5 WHERE id=$1",
      [id, b.latitude, b.longitude, b.address, b.publiclyListed],
    );
    await audit(db, req.user.id, "RESOURCE_LOCATION", "resource", id, {
      publiclyListed: b.publiclyListed,
      locationConfigured: b.latitude !== null,
    });
  });
  res.json({ ok: true });
});
management.get("/notification-jobs", async (_req, res) => {
  res.json({
    items: (
      await pool.query(
        "SELECT n.id,n.channel,n.status,n.incident_id,n.created_at,(SELECT role FROM user_profiles u WHERE u.id=n.recipient_id) recipient_role,coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',a.outcome,'at',a.created_at) ORDER BY a.created_at) FROM notification_attempts a WHERE a.job_id=n.id),'[]') attempts FROM notification_jobs n ORDER BY n.created_at DESC LIMIT 100",
      )
    ).rows,
  });
});
management.post("/users/:id/resend-invitation", async (req, res) => {
  if (!config.COGNITO_POOL_ID)
    fail(
      503,
      "IDENTITY_UNCONFIGURED",
      "Configure Cognito before sending invitations",
    );
  const u = (
    await pool.query(
      "SELECT id,email,cognito_sub FROM user_profiles WHERE id=$1 AND role IN('AUTHORITY','RESCUER') AND status='ACTIVE'",
      [uuid.parse(req.params.id)],
    )
  ).rows[0];
  if (!u) fail(404, "NOT_FOUND", "Active operational account not found");
  const cognito = new CognitoIdentityProviderClient({
    region: config.AWS_REGION,
  });
  const identity = await cognito.send(
    new AdminGetUserCommand({
      UserPoolId: config.COGNITO_POOL_ID,
      Username: u.cognito_sub,
    }),
  );
  if (identity.UserStatus !== "FORCE_CHANGE_PASSWORD")
    fail(
      409,
      "INVITATION_ACCEPTED",
      "This account no longer has a pending invitation. Use password recovery on the sign-in page.",
    );
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: config.COGNITO_POOL_ID,
      Username: identity.Username,
      MessageAction: "RESEND",
      DesiredDeliveryMediums: ["EMAIL"],
    }),
  );
  await transaction((db) =>
    audit(db, req.user.id, "INVITATION_RESENT", "user", u.id),
  );
  res.json({ submitted: true });
});
management.get("/organizations", async (_req, res) => {
  res.json({
    items: (
      await pool.query(
        "SELECT o.*, (SELECT count(*)::int FROM rescue_teams t WHERE t.organization_id=o.id) team_count FROM organizations o ORDER BY name LIMIT 100",
      )
    ).rows,
  });
});
management.post("/organizations", async (req, res) => {
  const b = z
    .object({ name: z.string().trim().min(2).max(100) })
    .strict()
    .parse(req.body);
  res.status(201).json(
    await transaction(async (db) => {
      const o = (
        await db.query(
          "INSERT INTO organizations(name) VALUES($1) RETURNING id",
          [b.name],
        )
      ).rows[0];
      await audit(
        db,
        req.user.id,
        "ORGANIZATION_CREATED",
        "organization",
        o.id,
      );
      return o;
    }),
  );
});
management.patch("/organizations/:id", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = z
    .object({ name: z.string().trim().min(2).max(100), active: z.boolean() })
    .strict()
    .parse(req.body);
  await transaction(async (db) => {
    if (
      !(
        await db.query("SELECT 1 FROM organizations WHERE id=$1 FOR UPDATE", [
          id,
        ])
      ).rowCount
    )
      fail(404, "NOT_FOUND", "Organization not found");
    await db.query(
      "SELECT id FROM rescue_teams WHERE organization_id=$1 ORDER BY id FOR UPDATE",
      [id],
    );
    if (
      !b.active &&
      (
        await db.query(
          `SELECT 1 FROM incident_assignments a JOIN rescue_teams t ON t.id=a.team_id WHERE t.organization_id=$1 AND a.${activeAssignments} LIMIT 1`,
          [id],
        )
      ).rowCount
    )
      fail(
        409,
        "ACTIVE_ASSIGNMENTS",
        "Complete or cancel active assignments before deactivating this organization",
      );
    await db.query("UPDATE organizations SET name=$2,active=$3 WHERE id=$1", [
      id,
      b.name,
      b.active,
    ]);
    if (!b.active) {
      await db.query(
        "UPDATE rescue_teams SET availability='UNAVAILABLE' WHERE organization_id=$1",
        [id],
      );
      await db.query(
        "UPDATE location_sessions SET active=false,stopped_at=now() WHERE active AND team_id IN(SELECT id FROM rescue_teams WHERE organization_id=$1)",
        [id],
      );
    }
    await audit(db, req.user.id, "ORGANIZATION_UPDATED", "organization", id, b);
  });
  res.json({ ok: true });
});
management.get("/team-details", async (_req, res) => {
  res.json({
    items: (
      await pool.query(`SELECT t.id,t.name,t.organization_id,t.department_id,t.jurisdiction_id,t.vehicle,t.capacity,t.availability,
    coalesce((SELECT jsonb_agg(jsonb_build_object('capability',capability,'expiresAt',expires_at) ORDER BY capability) FROM team_capabilities WHERE team_id=t.id),'[]') capabilities,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'status',u.status)) FROM team_memberships m JOIN user_profiles u ON u.id=m.user_id WHERE m.team_id=t.id),'[]') members,
    (SELECT count(*)::int FROM incident_assignments a WHERE a.team_id=t.id AND ${activeAssignments}) active_assignments
    FROM rescue_teams t ORDER BY t.name LIMIT 100`)
    ).rows,
  });
});
management.patch("/teams/:id", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = z
    .object({
      name: z.string().trim().min(2).max(100),
      organizationId: uuid.nullable(),
      vehicle: z.string().max(100),
      capacity: z.number().int().min(1).max(5),
      capabilities: z
        .array(
          z.object({
            capability: z.string().trim().min(2).max(50),
            expiresAt: z.iso.datetime().nullable(),
          }),
        )
        .max(20),
    })
    .strict()
    .parse(req.body);
  if (
    new Set(b.capabilities.map((c) => c.capability)).size !==
    b.capabilities.length
  )
    fail(400, "DUPLICATE_CAPABILITY", "Each capability must be listed once");
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
      await db.query("SELECT * FROM rescue_teams WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!t) fail(404, "NOT_FOUND", "Team not found");
    if (
      (
        await db.query(
          `SELECT 1 FROM incident_assignments WHERE team_id=$1 AND ${activeAssignments} LIMIT 1`,
          [id],
        )
      ).rowCount
    )
      fail(
        409,
        "ACTIVE_ASSIGNMENTS",
        "Complete or cancel active assignments before changing team configuration",
      );
    await db.query(
      "UPDATE rescue_teams SET name=$2,organization_id=$3,vehicle=$4,capacity=$5 WHERE id=$1",
      [id, b.name, b.organizationId, b.vehicle, b.capacity],
    );
    await db.query("DELETE FROM team_capabilities WHERE team_id=$1", [id]);
    for (const c of b.capabilities)
      await db.query(
        "INSERT INTO team_capabilities(team_id,capability,expires_at) VALUES($1,$2,$3)",
        [id, c.capability, c.expiresAt],
      );
    await audit(db, req.user.id, "TEAM_CONFIGURED", "team", id, {
      organizationId: b.organizationId,
      capacity: b.capacity,
      capabilities: b.capabilities,
    });
  });
  res.json({ ok: true });
});
management.patch("/users/:id/notification-preferences", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const b = z
    .object({
      phone: z
        .string()
        .regex(/^\+[1-9]\d{7,14}$/)
        .nullable(),
      smsEnabled: z.boolean(),
      emailEnabled: z.boolean().default(false),
    })
    .strict()
    .parse(req.body);
  if (b.smsEnabled && !b.phone)
    fail(
      400,
      "PHONE_REQUIRED",
      "A verified test destination is required to opt in",
    );
  await transaction(async (db) => {
    if (
      !(
        await db.query(
          "UPDATE user_profiles SET phone=$2,sms_enabled=$3,email_notifications=$4 WHERE id=$1 AND role IN('AUTHORITY','RESCUER') RETURNING id",
          [id, b.phone, b.smsEnabled, b.emailEnabled],
        )
      ).rowCount
    )
      fail(404, "NOT_FOUND", "Operational account not found");
    // Audit the decision, never the phone number.
    await audit(db, req.user.id, "NOTIFICATION_PREFERENCES", "user", id, {
      smsEnabled: b.smsEnabled,
      emailEnabled: b.emailEnabled,
      phoneConfigured: !!b.phone,
    });
  });
  res.json({
    ok: true,
    notice:
      "Recipient preferences saved. Sending still requires the separate deployment-wide SMS setting and provider sandbox approval.",
  });
});
