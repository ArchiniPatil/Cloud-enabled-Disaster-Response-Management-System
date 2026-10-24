import type { DB } from "./db.js";
import { fail, type User } from "./http.js";
export const scopeSQL = `( $2='ADMIN' OR i.reporter_id=$1 OR ($2='AUTHORITY' AND EXISTS(SELECT 1 FROM incident_departments d JOIN jurisdictions j ON j.id=$4 WHERE d.incident_id=i.id AND d.department_id=$3 AND ST_Covers(j.boundary,i.location::geometry))) OR ($2='RESCUER' AND EXISTS(SELECT 1 FROM incident_assignments a JOIN team_memberships m ON m.team_id=a.team_id WHERE a.incident_id=i.id AND m.user_id=$1 AND a.status NOT IN('DECLINED','CANCELLED') AND (a.status<>'COMPLETED' OR a.updated_at>now()-interval '24 hours'))))`;
export const scopeParams = (u: User) => [
  u.id,
  u.role,
  u.department_id,
  u.jurisdiction_id,
];
export async function incidentAccess(
  db: DB,
  u: User,
  id: string,
  lock = false,
) {
  const i = (
    await db.query(
      `SELECT i.*,ST_Y(i.location::geometry) latitude,ST_X(i.location::geometry) longitude FROM incidents i WHERE ${scopeSQL} AND i.id=$5 ${lock ? "FOR UPDATE OF i" : ""}`,
      [...scopeParams(u), id],
    )
  ).rows[0];
  if (!i) fail(404, "NOT_FOUND", "Incident not found");
  return i;
}
export async function teamAccess(db: DB, u: User, id: string) {
  const t = (
    await db.query(
      `SELECT t.* FROM rescue_teams t WHERE t.id=$1 AND ($2='ADMIN' OR ($2='AUTHORITY' AND t.department_id=$3 AND t.jurisdiction_id=$4) OR ($2='RESCUER' AND EXISTS(SELECT 1 FROM team_memberships m WHERE m.team_id=t.id AND m.user_id=$5)))`,
      [id, u.role, u.department_id, u.jurisdiction_id, u.id],
    )
  ).rows[0];
  if (!t) fail(404, "NOT_FOUND", "Team not found");
  return t;
}
export async function eligibleTeams(db: DB, incidentId: string, radius = 5000) {
  return (
    await db.query(
      `SELECT t.id,t.name,t.department_id,t.jurisdiction_id,t.capacity,ST_Distance(t.location,i.location) distance_m FROM rescue_teams t JOIN incidents i ON i.id=$1 JOIN categories c ON c.code=i.category JOIN jurisdictions j ON j.id=t.jurisdiction_id WHERE t.availability='AVAILABLE' AND EXISTS(SELECT 1 FROM location_sessions ls JOIN user_profiles lu ON lu.id=ls.user_id WHERE ls.team_id=t.id AND ls.active AND ls.expires_at>now() AND lu.status='ACTIVE') AND t.location_at>now()-interval '5 minutes' AND t.accuracy<=200 AND ST_DWithin(t.location,i.location,$2) AND ST_Covers(j.boundary,i.location::geometry) AND EXISTS(SELECT 1 FROM incident_departments d WHERE d.incident_id=i.id AND d.department_id=t.department_id) AND NOT EXISTS(SELECT 1 FROM unnest(c.required_capabilities) cap WHERE NOT EXISTS(SELECT 1 FROM team_capabilities tc WHERE tc.team_id=t.id AND tc.capability=cap AND (tc.expires_at IS NULL OR tc.expires_at>now()))) AND (SELECT count(*) FROM incident_assignments a WHERE a.team_id=t.id AND a.status NOT IN('COMPLETED','DECLINED','CANCELLED'))<t.capacity ORDER BY distance_m LIMIT 50`,
      [incidentId, radius],
    )
  ).rows;
}
