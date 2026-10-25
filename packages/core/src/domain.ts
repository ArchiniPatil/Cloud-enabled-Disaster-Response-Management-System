import { z } from "zod";
export const roles = ["CITIZEN", "AUTHORITY", "RESCUER", "ADMIN"] as const;
export type Role = (typeof roles)[number];
export const statuses = [
  "SUBMITTED",
  "NEEDS_VERIFICATION",
  "ACKNOWLEDGED",
  "DISPATCHED",
  "TEAM_EN_ROUTE",
  "TEAM_ON_SCENE",
  "RESOLVED",
  "DUPLICATE",
  "CANCELLED",
  "UNABLE_TO_RESPOND",
  "REOPENED",
] as const;
export type Status = (typeof statuses)[number];
export const transitions: Record<Status, readonly Status[]> = {
  SUBMITTED: [
    "ACKNOWLEDGED",
    "NEEDS_VERIFICATION",
    "DUPLICATE",
    "CANCELLED",
    "UNABLE_TO_RESPOND",
  ],
  NEEDS_VERIFICATION: ["ACKNOWLEDGED", "DUPLICATE", "CANCELLED"],
  ACKNOWLEDGED: ["DISPATCHED", "CANCELLED", "UNABLE_TO_RESPOND"],
  DISPATCHED: ["TEAM_EN_ROUTE", "CANCELLED", "UNABLE_TO_RESPOND"],
  TEAM_EN_ROUTE: ["TEAM_ON_SCENE", "CANCELLED", "UNABLE_TO_RESPOND"],
  TEAM_ON_SCENE: ["RESOLVED", "UNABLE_TO_RESPOND"],
  RESOLVED: ["REOPENED"],
  DUPLICATE: ["REOPENED"],
  CANCELLED: ["REOPENED"],
  UNABLE_TO_RESPOND: ["REOPENED"],
  REOPENED: [
    "ACKNOWLEDGED",
    "NEEDS_VERIFICATION",
    "CANCELLED",
    "UNABLE_TO_RESPOND",
  ],
};
export const assignmentTransitions: Record<string, readonly string[]> = {
  OFFERED: ["ACCEPTED", "DECLINED", "CANCELLED"],
  ACCEPTED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["EN_ROUTE", "CANCELLED"],
  EN_ROUTE: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
  DECLINED: [],
  CANCELLED: [],
  COMPLETED: [],
};
export const terminalAssignments = ["DECLINED", "CANCELLED", "COMPLETED"];
export const terminalIncidents = [
  "RESOLVED",
  "DUPLICATE",
  "CANCELLED",
  "UNABLE_TO_RESPOND",
];
export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export const incidentSchema = coordinateSchema
  .extend({
    category: z.string().min(2).max(60),
    severity: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]),
    kind: z.enum(["EMERGENCY", "REPORT"]),
    description: z.string().max(2000).default(""),
    address: z.string().max(300).default(""),
    peopleAffected: z.number().int().min(1).max(1000000).optional(),
    hazards: z.string().trim().max(1000).default(""),
    locationAccuracyM: z.number().min(0).max(100000).optional(),
  })
  .strict();
export function canTransition(from: Status, to: Status) {
  return transitions[from]?.includes(to) ?? false;
}
export function escalationNeeded(
  severity: string,
  status: string,
  hasDispatch: boolean,
) {
  return (
    !terminalIncidents.includes(status) &&
    !hasDispatch &&
    (severity === "CRITICAL" ||
      ![
        "ACKNOWLEDGED",
        "DISPATCHED",
        "TEAM_EN_ROUTE",
        "TEAM_ON_SCENE",
      ].includes(status))
  );
}
export function locationState(
  observed: string | Date,
  accuracy: number,
  now = Date.now(),
) {
  const age = now - new Date(observed).getTime();
  return age < 0 || age > 90_000 || accuracy > 200 ? "STALE" : "LIVE";
}
export function etaLabel(seconds?: number | null) {
  return seconds != null && Number.isFinite(seconds) && seconds >= 0
    ? `Estimated ${Math.ceil(seconds / 60)} min`
    : "ETA unavailable";
}
