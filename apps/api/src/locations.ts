import { Router } from "express";
import { z } from "zod";
import {
  LocationClient,
  CalculateRouteCommand,
  GetMapStyleDescriptorCommand,
  GetMapTileCommand,
  GetMapGlyphsCommand,
  GetMapSpritesCommand,
} from "@aws-sdk/client-location";
import {
  coordinateSchema,
  locationState,
} from "../../../packages/core/src/domain.js";
import { pool, transaction, audit } from "./db.js";
import { fail, requireRole } from "./http.js";
import { teamAccess, incidentAccess } from "./policy.js";
import { config } from "./config.js";
const location = new LocationClient({ region: config.AWS_REGION });
const uuid = z.string().uuid();
export const locationsRouter = Router();
locationsRouter.post("/sessions", requireRole("RESCUER"), async (req, res) => {
  const { teamId } = z.object({ teamId: uuid }).strict().parse(req.body);
  res.status(201).json(
    await transaction(async (db) => {
      const team = await teamAccess(db, req.user, teamId);
      await db.query("SELECT id FROM rescue_teams WHERE id=$1 FOR UPDATE", [
        teamId,
      ]);
      if (team.availability !== "AVAILABLE")
        fail(409, "OFF_DUTY", "Start duty before sharing location");
      await db.query(
        "UPDATE location_sessions SET active=false,stopped_at=now() WHERE team_id=$1 AND expires_at<=now()",
        [teamId],
      );
      const existing = (
        await db.query(
          "SELECT id,user_id FROM location_sessions WHERE team_id=$1 AND active",
          [teamId],
        )
      ).rows[0];
      if (existing) {
        if (existing.user_id !== req.user.id)
          fail(409, "DEVICE_ACTIVE", "Another team member is sharing location");
        return { id: existing.id };
      }
      const s = (
        await db.query(
          "INSERT INTO location_sessions(team_id,user_id) VALUES($1,$2) RETURNING id",
          [teamId, req.user.id],
        )
      ).rows[0];
      await audit(db, req.user.id, "LOCATION_STARTED", "team", teamId);
      return s;
    }),
  );
});
locationsRouter.delete(
  "/sessions/:id",
  requireRole("RESCUER"),
  async (req, res) => {
    await pool.query(
      "UPDATE location_sessions SET active=false,stopped_at=now() WHERE id=$1 AND user_id=$2 AND active",
      [uuid.parse(req.params.id), req.user.id],
    );
    res.json({ ok: true });
  },
);
locationsRouter.post("/updates", requireRole("RESCUER"), async (req, res) => {
  const b = coordinateSchema
    .extend({
      sessionId: uuid,
      accuracy: z.number().min(0).max(10000),
      observedAt: z.iso.datetime(),
    })
    .strict()
    .parse(req.body);
  if (
    Date.now() - Date.parse(b.observedAt) > 60000 ||
    Date.parse(b.observedAt) > Date.now() + 5000
  )
    fail(400, "STALE_SAMPLE", "Location sample must be recent");
  await transaction(async (db) => {
    const s = (
      await db.query(
        "SELECT s.* FROM location_sessions s JOIN rescue_teams t ON t.id=s.team_id WHERE s.id=$1 AND s.user_id=$2 AND s.active AND s.expires_at>now() AND t.availability='AVAILABLE' FOR UPDATE OF s",
        [b.sessionId, req.user.id],
      )
    ).rows[0];
    if (!s)
      fail(403, "TRACKING_STOPPED", "Location sharing is no longer authorized");
    const t = (
      await db.query(
        "SELECT location_at FROM rescue_teams WHERE id=$1 FOR UPDATE",
        [s.team_id],
      )
    ).rows[0];
    if (
      t.location_at &&
      new Date(t.location_at).getTime() >= Date.parse(b.observedAt)
    )
      fail(409, "OLD_SAMPLE", "A newer location sample already exists");
    await db.query(
      "INSERT INTO team_location_updates(session_id,team_id,location,accuracy,observed_at) VALUES($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5,$6)",
      [s.id, s.team_id, b.longitude, b.latitude, b.accuracy, b.observedAt],
    );
    await db.query(
      "UPDATE rescue_teams SET location=ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,location_at=$4,accuracy=$5 WHERE id=$1",
      [s.team_id, b.longitude, b.latitude, b.observedAt, b.accuracy],
    );
  });
  res.status(202).json({ received: true });
});
locationsRouter.get("/incidents/:id", async (req, res) =>
  res.json(
    await transaction(async (db) => {
      const i = await incidentAccess(db, req.user, uuid.parse(req.params.id));
      const teams = (
        await db.query(
          `SELECT a.id assignment_id,a.status,t.id,t.name,ST_X(t.location::geometry) longitude,ST_Y(t.location::geometry) latitude,t.location_at,t.accuracy,ST_Distance(t.location,i.location) straight_line_m FROM incident_assignments a JOIN rescue_teams t ON t.id=a.team_id JOIN incidents i ON i.id=a.incident_id WHERE a.incident_id=$1 AND a.status IN('DISPATCHED','EN_ROUTE','ARRIVED','IN_PROGRESS') AND EXISTS(SELECT 1 FROM location_sessions s JOIN user_profiles u ON u.id=s.user_id WHERE s.team_id=t.id AND s.active AND s.expires_at>now() AND u.status='ACTIVE') AND ($2<>'RESCUER' OR EXISTS(SELECT 1 FROM team_memberships m WHERE m.team_id=t.id AND m.user_id=$3))`,
          [i.id, req.user.role, req.user.id],
        )
      ).rows;
      for (const team of teams) {
        team.tracking = team.location_at
          ? locationState(team.location_at, team.accuracy)
          : "UNAVAILABLE";
        team.route = null;
        if (team.tracking === "LIVE" && config.LOCATION_ROUTE_CALCULATOR) {
          const old = (
            await db.query(
              "SELECT distance_m,duration_s,calculated_at FROM route_cache WHERE assignment_id=$1 AND calculated_at>now()-interval '60 seconds'",
              [team.assignment_id],
            )
          ).rows[0];
          if (old) team.route = old;
          else
            try {
              const route = await location.send(
                new CalculateRouteCommand({
                  CalculatorName: config.LOCATION_ROUTE_CALCULATOR,
                  DeparturePosition: [team.longitude, team.latitude],
                  DestinationPosition: [i.longitude, i.latitude],
                  TravelMode: "Car",
                  DepartNow: true,
                }),
              );
              if (route.Summary) {
                team.route = {
                  distance_m: route.Summary.Distance! * 1000,
                  duration_s: route.Summary.DurationSeconds,
                  calculated_at: new Date().toISOString(),
                };
                await db.query(
                  "INSERT INTO route_cache(assignment_id,distance_m,duration_s) VALUES($1,$2,$3) ON CONFLICT(assignment_id) DO UPDATE SET distance_m=$2,duration_s=$3,calculated_at=now()",
                  [
                    team.assignment_id,
                    team.route.distance_m,
                    team.route.duration_s,
                  ],
                );
              }
            } catch {
              team.routeError = "Route service unavailable";
            }
        }
      }
      return {
        teams,
        incident: { latitude: i.latitude, longitude: i.longitude },
        notice: teams.length
          ? "Only active, authorized assignment tracking is shown."
          : "No active authorized tracking. ETA unavailable.",
      };
    }),
  ),
);
locationsRouter.get("/map/style", async (_req, res) => {
  if (!config.LOCATION_MAP_NAME)
    fail(503, "MAP_UNCONFIGURED", "Amazon Location map is not configured");
  const r = await location.send(
    new GetMapStyleDescriptorCommand({ MapName: config.LOCATION_MAP_NAME }),
  );
  const style = JSON.parse(new TextDecoder().decode(r.Blob));
  const rewrite = (v: unknown): unknown => {
    if (typeof v === "string" && v.includes("/maps/v0/maps/"))
      return v.replace(
        /https:\/\/[^/]+\/maps\/v0\/maps\/[^/]+/g,
        "/api/v1/locations/map",
      );
    if (Array.isArray(v)) return v.map(rewrite);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, rewrite(x)]),
      );
    return v;
  };
  res.json(rewrite(style));
});
locationsRouter.get("/map/tiles/:z/:x/:y", async (req, res) => {
  if (!config.LOCATION_MAP_NAME)
    fail(503, "MAP_UNCONFIGURED", "Map unavailable");
  const p = z
    .object({
      z: z.coerce.number().int().min(0).max(22),
      x: z.coerce.number().int().min(0),
      y: z.coerce.number().int().min(0),
    })
    .parse(req.params);
  const r = await location.send(
    new GetMapTileCommand({
      MapName: config.LOCATION_MAP_NAME,
      Z: String(p.z),
      X: String(p.x),
      Y: String(p.y),
    }),
  );
  res
    .type(r.ContentType ?? "application/octet-stream")
    .send(Buffer.from(r.Blob!));
});
locationsRouter.get("/map/glyphs/:font/:range", async (req, res) => {
  if (!config.LOCATION_MAP_NAME)
    fail(503, "MAP_UNCONFIGURED", "Map unavailable");
  const r = await location.send(
    new GetMapGlyphsCommand({
      MapName: config.LOCATION_MAP_NAME,
      FontStack: z.string().max(200).parse(req.params.font),
      FontUnicodeRange: z
        .string()
        .regex(/^\d+-\d+\.pbf$/)
        .parse(req.params.range),
    }),
  );
  res
    .type(r.ContentType ?? "application/octet-stream")
    .send(Buffer.from(r.Blob!));
});
locationsRouter.get("/map/sprites/:file", async (req, res) => {
  if (!config.LOCATION_MAP_NAME)
    fail(503, "MAP_UNCONFIGURED", "Map unavailable");
  const r = await location.send(
    new GetMapSpritesCommand({
      MapName: config.LOCATION_MAP_NAME,
      FileName: z
        .string()
        .regex(/^sprites(@2x)?\.(json|png)$/)
        .parse(req.params.file),
    }),
  );
  res
    .type(r.ContentType ?? "application/octet-stream")
    .send(Buffer.from(r.Blob!));
});
