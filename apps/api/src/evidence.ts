import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";
import { transaction, audit } from "./db.js";
import { incidentAccess } from "./policy.js";
import { fail } from "./http.js";
export const s3 = new S3Client({ region: config.AWS_REGION });
export const evidenceRouter = Router();
const uuid = z.string().uuid();
evidenceRouter.post("/upload", async (req, res) => {
  if (!config.EVIDENCE_BUCKET)
    fail(503, "STORAGE_UNCONFIGURED", "Evidence storage is not configured");
  const b = z
    .object({
      incidentId: uuid,
      contentType: z.enum(["image/jpeg", "image/png"]),
      size: z.number().int().min(1).max(5242880),
    })
    .strict()
    .parse(req.body);
  res.json(
    await transaction(async (db) => {
      const i = await incidentAccess(db, req.user, b.incidentId, true);
      if (i.reporter_id !== req.user.id)
        fail(403, "FORBIDDEN", "Only the reporter can attach evidence");
      if (
        Number(
          (
            await db.query(
              "SELECT count(*) FROM incident_evidence WHERE incident_id=$1",
              [i.id],
            )
          ).rows[0].count,
        ) >= 5
      )
        fail(409, "EVIDENCE_LIMIT", "Maximum five attachments");
      const id = randomUUID(),
        key = `pending/${i.id}/${id}`;
      await db.query(
        "INSERT INTO incident_evidence(id,incident_id,owner_id,object_key,content_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6)",
        [id, i.id, req.user.id, key, b.contentType, b.size],
      );
      const upload = await createPresignedPost(s3, {
        Bucket: config.EVIDENCE_BUCKET!,
        Key: key,
        Expires: 120,
        Fields: {
          "Content-Type": b.contentType,
          "x-amz-server-side-encryption": "AES256",
        },
        Conditions: [
          ["content-length-range", b.size, b.size],
          ["eq", "$Content-Type", b.contentType],
          ["eq", "$x-amz-server-side-encryption", "AES256"],
        ],
      });
      return { id, upload };
    }),
  );
});
evidenceRouter.post("/:id/complete", async (req, res) =>
  res.json(
    await transaction(async (db) => {
      const e = (
        await db.query(
          "SELECT * FROM incident_evidence WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [uuid.parse(req.params.id), req.user.id],
        )
      ).rows[0];
      if (!e) fail(404, "NOT_FOUND", "Evidence not found");
      await incidentAccess(db, req.user, e.incident_id);
      if (e.status !== "PENDING") return { status: e.status };
      const head = await s3.send(
        new HeadObjectCommand({
          Bucket: config.EVIDENCE_BUCKET,
          Key: e.object_key,
        }),
      );
      if (
        head.ContentLength !== e.size_bytes ||
        head.ContentType !== e.content_type
      )
        fail(
          400,
          "INVALID_FILE",
          "Uploaded file does not match declared type or size",
        );
      const prefix = await s3.send(
        new GetObjectCommand({
          Bucket: config.EVIDENCE_BUCKET,
          Key: e.object_key,
          Range: "bytes=0-11",
          VersionId: head.VersionId,
          IfMatch: head.ETag,
        }),
      );
      const bytes = Buffer.from(await prefix.Body!.transformToByteArray());
      const valid =
        e.content_type === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!valid) {
        await db.query(
          "UPDATE incident_evidence SET status='REJECTED' WHERE id=$1",
          [e.id],
        );
        return { status: "REJECTED" };
      }
      // Finalized evidence is never writable using the still-valid upload URL.
      const finalKey = `evidence/${e.incident_id}/${e.id}`;
      await s3.send(
        new CopyObjectCommand({
          Bucket: config.EVIDENCE_BUCKET,
          Key: finalKey,
          CopySource: `${config.EVIDENCE_BUCKET}/${e.object_key}${head.VersionId ? `?versionId=${encodeURIComponent(head.VersionId)}` : ""}`,
          CopySourceIfMatch: head.ETag,
          ServerSideEncryption: "AES256",
          MetadataDirective: "REPLACE",
          ContentType: e.content_type,
          ContentDisposition: "attachment",
        }),
      );
      await s3.send(
        new DeleteObjectCommand({
          Bucket: config.EVIDENCE_BUCKET,
          Key: e.object_key,
        }),
      );
      await db.query(
        "UPDATE incident_evidence SET status='AVAILABLE',object_key=$2 WHERE id=$1",
        [e.id, finalKey],
      );
      await audit(
        db,
        req.user.id,
        "EVIDENCE_ATTACHED",
        "incident",
        e.incident_id,
      );
      return { status: "AVAILABLE" };
    }),
  ),
);
evidenceRouter.get("/:id", async (req, res) =>
  res.json(
    await transaction(async (db) => {
      const e = (
        await db.query(
          "SELECT * FROM incident_evidence WHERE id=$1 AND status='AVAILABLE'",
          [uuid.parse(req.params.id)],
        )
      ).rows[0];
      if (!e) fail(404, "NOT_FOUND", "Evidence not found");
      await incidentAccess(db, req.user, e.incident_id);
      return {
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: config.EVIDENCE_BUCKET,
            Key: e.object_key,
            ResponseContentDisposition: "attachment",
          }),
          { expiresIn: 60 },
        ),
      };
    }),
  ),
);
