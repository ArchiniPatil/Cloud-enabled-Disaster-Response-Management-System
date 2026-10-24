import { consumeEvent, tick } from "./jobs.js";
import { z } from "zod";
const eventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["INCIDENT_CREATED", "STATUS_CHANGED"]),
  payload: z.object({
    incidentId: z.string().uuid(),
    status: z.string().optional(),
  }),
});
export async function handler(event: {
  Records?: { messageId: string; body: string }[];
}) {
  if (!event.Records) {
    await tick();
    return { ok: true };
  }
  const failures = [];
  for (const r of event.Records) {
    try {
      await consumeEvent(eventSchema.parse(JSON.parse(r.body)));
    } catch {
      failures.push({ itemIdentifier: r.messageId });
    }
  }
  return { batchItemFailures: failures };
}
