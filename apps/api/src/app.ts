import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { ZodError, z } from "zod";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { pool, transaction } from "./db.js";
import { authRouter, authenticate, csrf, allowedOrigin } from "./auth.js";
import { incidentRouter, assignmentsRouter } from "./incidents.js";
import { operations } from "./operations.js";
import { metrics } from "./metrics.js";
import { locationsRouter } from "./locations.js";
import { evidenceRouter } from "./evidence.js";
import { incidentAccess } from "./policy.js";
export const app = express();
app.disable("x-powered-by");
if (config.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && allowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-CSRF-Token, Idempotency-Key",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Request-ID", randomUUID());
  next();
});
app.use(express.json({ limit: "32kb" }), cookieParser());
app.get("/api/v1/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/v1/health/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.use(
  "/api/v1/auth",
  rateLimit({
    windowMs: 60000,
    limit: config.NODE_ENV === "test" ? 10000 : 300,
    skip: (req) => !["/me", "/config"].includes(req.path),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many session checks. Please wait before retrying.",
      },
    },
  }),
);
app.use(
  "/api/v1/auth",
  rateLimit({
    windowMs: 60000,
    limit: config.NODE_ENV === "test" ? 10000 : 40,
    skip: (req) => ["/me", "/config"].includes(req.path),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait before retrying.",
      },
    },
  }),
  authRouter,
);
app.use("/api/v1", authenticate, csrf);
app.use(
  "/api/v1",
  rateLimit({
    windowMs: 60000,
    keyGenerator: (req) => req.user.id,
    limit: config.NODE_ENV === "test" ? 10000 : 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait before retrying.",
      },
    },
  }),
);
app.get("/api/v1/incidents/:id/events", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    await transaction((db) => incidentAccess(db, req.user, id));
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const valid = (
          await pool.query(
            "SELECT 1 FROM sessions s JOIN user_profiles u ON u.id=s.user_id WHERE s.id_hash=$1 AND s.expires_at>now() AND s.access_expires>now() AND u.status=$2 AND s.version=u.session_version",
            [req.sessionHash, "ACTIVE"],
          )
        ).rowCount;
        if (!valid) {
          res.write("event: revoked\ndata: {}\n\n");
          res.end();
          return;
        }
        await transaction((db) => incidentAccess(db, req.user, id));
        res.write(
          `event: refresh\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
        );
      } catch {
        res.end();
      } finally {
        busy = false;
      }
    }, 3000);
    const stop = () => clearInterval(timer);
    res.on("close", stop);
    res.write("event: refresh\ndata: {}\n\n");
  } catch (e) {
    next(e);
  }
});
app.use("/api/v1/incidents", incidentRouter);
app.use("/api/v1/emergency-requests", incidentRouter);
app.use("/api/v1/assignments", assignmentsRouter);
app.use("/api/v1/locations", locationsRouter);
app.use("/api/v1/evidence", evidenceRouter);
app.use("/api/v1", operations);
app.use("/api/v1", metrics);
app.use((_req, res) =>
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Route not found" } }),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION",
          message: "Check the submitted fields",
          fields: error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
      return;
    }
    const e = error as { status?: number; code?: string; message?: string };
    if (e.code === "23505") {
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "A conflicting record already exists",
        },
      });
      return;
    }
    if (e.code === "23503") {
      res.status(400).json({
        error: {
          code: "REFERENCE",
          message: "Referenced record does not exist",
        },
      });
      return;
    }
    const status =
      e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    if (status === 500)
      console.error(
        JSON.stringify({
          event: "request_failed",
          requestId: res.getHeader("X-Request-ID"),
          errorType: (error as Error)?.name ?? "Error",
        }),
      );
    res.status(status).json({
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : (e.code ?? "REQUEST_FAILED"),
        message:
          status === 500
            ? "The request could not be completed. Please retry."
            : e.message,
      },
    });
  },
);
