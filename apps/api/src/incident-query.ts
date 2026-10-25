import { z } from "zod";
import type { Request } from "express";
import { scopeSQL, scopeParams } from "./policy.js";
import { statuses } from "../../../packages/core/src/domain.js";

export const activeSQL =
  "i.status NOT IN('RESOLVED','CANCELLED','DUPLICATE','UNABLE_TO_RESPOND')";
export const assignedSQL =
  "EXISTS(SELECT 1 FROM incident_assignments a WHERE a.incident_id=i.id AND a.status NOT IN('COMPLETED','DECLINED','CANCELLED'))";
export const overdueSQL = `(${activeSQL} AND EXISTS(SELECT 1 FROM escalation_executions e WHERE e.incident_id=i.id AND e.completed_at IS NULL AND e.due_at<now()))`;
export function incidentQuery(req: Request) {
  const filters = z
    .object({
      q: z.string().trim().max(100).optional(),
      category: z.string().max(60).optional(),
      severity: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).optional(),
      status: z.enum(statuses).optional(),
      department: z.string().uuid().optional(),
      hours: z.coerce.number().int().min(1).max(2160).optional(),
      view: z.enum(["active", "unassigned", "overdue", "all"]).default("all"),
      sort: z.enum(["priority", "recent"]).default("priority"),
    })
    .parse(req.query);
  const params: unknown[] = [...scopeParams(req.user)];
  const where = [scopeSQL];
  const value = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (filters.q) {
    const p = value(filters.q);
    where.push(
      `(position(lower(${p}) in lower(i.id::text))>0 OR position(lower(${p}) in lower(i.address))>0)`,
    );
  }
  if (filters.category) where.push(`i.category=${value(filters.category)}`);
  if (filters.severity) where.push(`i.severity=${value(filters.severity)}`);
  if (filters.status) where.push(`i.status=${value(filters.status)}`);
  if (filters.department)
    where.push(
      `EXISTS(SELECT 1 FROM incident_departments d WHERE d.incident_id=i.id AND d.department_id=${value(filters.department)})`,
    );
  if (filters.hours)
    where.push(`i.created_at>=now()-${value(filters.hours)}*interval '1 hour'`);
  if (filters.view === "active") where.push(activeSQL);
  if (filters.view === "unassigned")
    where.push(`${activeSQL} AND NOT ${assignedSQL}`);
  if (filters.view === "overdue") where.push(overdueSQL);
  return {
    where: where.join(" AND "),
    params,
    sort:
      filters.sort === "recent"
        ? "i.created_at DESC,i.id"
        : `CASE WHEN ${activeSQL} THEN 0 ELSE 1 END,CASE i.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MODERATE' THEN 2 ELSE 3 END,i.created_at,i.id`,
  };
}
