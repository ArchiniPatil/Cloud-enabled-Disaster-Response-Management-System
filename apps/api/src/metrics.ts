import { Router } from "express";
import { z } from "zod";
import { pool } from "./db.js";
import { requireRole } from "./http.js";
import { scopeSQL, scopeParams } from "./policy.js";
export const metrics = Router();
metrics.get(
  "/metrics/operations",
  requireRole("ADMIN", "AUTHORITY"),
  async (req, res) => {
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(30)
      .parse(req.query.days);
    const params = [...scopeParams(req.user), days];
    const [summary, categories, teams, resources] = await Promise.all([
      pool.query(
        `WITH scoped AS (SELECT i.* FROM incidents i WHERE ${scopeSQL} AND i.created_at>=now()-$5*interval '1 day'), durations AS (
      SELECT i.id,i.status,
        extract(epoch FROM (h.ack-i.response_cycle_started_at)) ack_seconds,
        extract(epoch FROM (h.dispatched-i.response_cycle_started_at)) dispatch_seconds,
        extract(epoch FROM (h.arrived-i.response_cycle_started_at)) arrival_seconds,
        extract(epoch FROM (h.resolved-i.response_cycle_started_at)) resolution_seconds,
        EXISTS(SELECT 1 FROM escalation_executions e WHERE e.incident_id=i.id AND e.completed_at>=i.response_cycle_started_at AND e.stage>0 AND e.outcome<>'SATISFIED') escalated
      FROM scoped i LEFT JOIN LATERAL (SELECT min(created_at) FILTER(WHERE to_status='ACKNOWLEDGED') ack,min(created_at) FILTER(WHERE to_status='DISPATCHED') dispatched,min(created_at) FILTER(WHERE to_status='TEAM_ON_SCENE') arrived,min(created_at) FILTER(WHERE to_status='RESOLVED') resolved FROM incident_status_history WHERE incident_id=i.id AND created_at>=i.response_cycle_started_at) h ON true)
      SELECT count(*)::int reported,count(*) FILTER(WHERE status='RESOLVED')::int resolved,count(*) FILTER(WHERE status NOT IN('RESOLVED','CANCELLED','DUPLICATE','UNABLE_TO_RESPOND'))::int open,count(*) FILTER(WHERE escalated)::int escalated,
      avg(ack_seconds)::float8 acknowledgement_seconds,avg(dispatch_seconds)::float8 dispatch_seconds,avg(arrival_seconds)::float8 arrival_seconds,avg(resolution_seconds)::float8 resolution_seconds,
      count(ack_seconds)::int acknowledged_samples,count(arrival_seconds)::int arrival_samples FROM durations`,
        params,
      ),
      pool.query(
        `SELECT c.label,count(*)::int count FROM incidents i JOIN categories c ON c.code=i.category WHERE ${scopeSQL} AND i.created_at>=now()-$5*interval '1 day' GROUP BY c.label ORDER BY count(*) DESC`,
        params,
      ),
      pool.query(
        `SELECT t.id,t.name,t.availability,t.capacity,(SELECT count(*)::int FROM incident_assignments a WHERE a.team_id=t.id AND a.status NOT IN('COMPLETED','DECLINED','CANCELLED')) active_assignments,(SELECT count(*)::int FROM incident_assignments a WHERE a.team_id=t.id AND a.status='COMPLETED' AND a.updated_at>=now()-$4*interval '1 day') completed_assignments FROM rescue_teams t WHERE ($1='ADMIN' OR (t.department_id=$2 AND t.jurisdiction_id=$3)) ORDER BY t.name LIMIT 100`,
        [req.user.role, req.user.department_id, req.user.jurisdiction_id, days],
      ),
      pool.query(
        `SELECT r.id,r.name,r.quantity,r.status,coalesce((SELECT sum(quantity)::int FROM resource_allocations a WHERE a.resource_id=r.id AND released_at IS NULL),0) allocated FROM resources r WHERE ($1='ADMIN' OR (r.department_id=$2 AND r.jurisdiction_id=$3)) ORDER BY r.name LIMIT 100`,
        [req.user.role, req.user.department_id, req.user.jurisdiction_id],
      ),
    ]);
    res.json({
      days,
      summary: summary.rows[0],
      categories: categories.rows,
      teams: teams.rows,
      resources: resources.rows,
      asOf: new Date().toISOString(),
    });
  },
);
