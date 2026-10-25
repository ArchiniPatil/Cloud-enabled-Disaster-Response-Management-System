import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { transaction, type DB, audit } from "./db.js";

// Only a restricted CloudWatch Logs subscription may invoke this Lambda.
// Never store or log the destination phone or raw provider response.
export async function reconcileReceipt(db: DB, providerId: string) {
  const job = (
    await db.query(
      `SELECT j.id,j.status FROM notification_jobs j WHERE EXISTS(SELECT 1 FROM notification_attempts a WHERE a.job_id=j.id AND a.provider_id=$1) FOR UPDATE OF j`,
      [providerId],
    )
  ).rows[0];
  if (!job) return;
  const latest = (
    await db.query(
      "SELECT provider_id FROM notification_attempts WHERE job_id=$1 AND outcome='SUBMITTED' ORDER BY created_at DESC,id DESC LIMIT 1",
      [job.id],
    )
  ).rows[0];
  // A late failure for an older retry must not overwrite the current attempt.
  if (latest?.provider_id !== providerId || job.status === "DELIVERED") return;
  const receipt = (
    await db.query(
      "SELECT outcome FROM sms_delivery_receipts WHERE provider_id=$1 ORDER BY CASE outcome WHEN 'DELIVERED' THEN 0 ELSE 1 END LIMIT 1",
      [providerId],
    )
  ).rows[0];
  if (!receipt || receipt.outcome === job.status) return;
  await db.query("UPDATE notification_jobs SET status=$2 WHERE id=$1", [
    job.id,
    receipt.outcome,
  ]);
  await db.query(
    "INSERT INTO notification_attempts(job_id,provider_id,outcome) VALUES($1,$2,$3)",
    [job.id, providerId, receipt.outcome],
  );
  await audit(db, null, "SMS_DELIVERY_RECEIPT", "notification", job.id, {
    outcome: receipt.outcome,
  });
}
const record = z.object({
  notification: z.object({ messageId: z.string().min(1).max(200) }),
  status: z.enum(["SUCCESS", "FAILURE"]),
});
export async function recordReceipt(input: unknown) {
  const parsed = record.safeParse(input);
  if (!parsed.success) return false;
  const id = parsed.data.notification.messageId;
  await transaction(async (db) => {
    await db.query(
      "INSERT INTO sms_delivery_receipts(provider_id,outcome) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, parsed.data.status === "SUCCESS" ? "DELIVERED" : "FAILED"],
    );
    await reconcileReceipt(db, id);
  });
  return true;
}
export async function handler(event: { awslogs: { data: string } }) {
  const payload = JSON.parse(
    gunzipSync(Buffer.from(event.awslogs.data, "base64"), {
      maxOutputLength: 4 * 1024 * 1024,
    }).toString("utf8"),
  );
  if (payload.messageType === "CONTROL_MESSAGE") return;
  const allowed = (process.env.SMS_RECEIPT_LOG_GROUPS ?? "")
    .split(",")
    .filter(Boolean);
  if (!allowed.includes(payload.logGroup))
    throw new Error("Unexpected delivery log source");
  let accepted = 0;
  for (const e of payload.logEvents ?? []) {
    let input: unknown;
    try {
      input = JSON.parse(e.message);
    } catch {
      continue;
    }
    if (await recordReceipt(input)) accepted++;
  }
  return { accepted };
}
