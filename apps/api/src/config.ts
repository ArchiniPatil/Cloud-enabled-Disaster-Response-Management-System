import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  AUTH_MODE: z.enum(["cognito", "demo"]).default("cognito"),
  EVENT_TRANSPORT: z.enum(["aws", "database"]).optional(),
  REALTIME_TRANSPORT: z.enum(["sse", "poll"]).default("sse"),
  DATABASE_URL: z.string().optional(),
  DATABASE_SECRET_ARN: z.string().optional(),
  AWS_REGION: z.string().default("ap-south-1"),
  PORT: z.coerce.number().default(4000),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_ORIGIN: z.string().url().default("http://localhost:4000"),
  COGNITO_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_DOMAIN: z.string().optional(),
  SESSION_KEY: z.string().optional(),
  SESSION_SECRET_ARN: z.string().optional(),
  EVIDENCE_BUCKET: z.string().optional(),
  EVENT_TOPIC_ARN: z.string().optional(),
  LOCATION_MAP_NAME: z.string().optional(),
  LOCATION_PLACE_INDEX: z.string().optional(),
  LOCATION_ROUTE_CALCULATOR: z.string().optional(),
  ANALYTICS_BUCKET: z.string().optional(),
  SMS_ENABLED: z.enum(["true", "false"]).default("false"),
  LOCATION_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  EMERGENCY_PHONE: z.string().optional(),
});
export const config = schema.parse(process.env);
if (
  config.EVENT_TRANSPORT === "database" &&
  (config.NODE_ENV === "production" ||
    config.DATABASE_SECRET_ARN ||
    !config.DATABASE_URL ||
    !["localhost", "127.0.0.1"].includes(new URL(config.DATABASE_URL).hostname))
)
  throw new Error(
    "Database event transport is restricted to a local development database",
  );
if (
  config.NODE_ENV === "production" &&
  (config.AUTH_MODE === "demo" ||
    (!config.SESSION_KEY && !config.SESSION_SECRET_ARN) ||
    !config.APP_ORIGIN.startsWith("https://") ||
    !config.API_ORIGIN.startsWith("https://"))
)
  throw new Error(
    "Production requires Cognito, SESSION_KEY, and HTTPS origins",
  );
if (
  config.AUTH_MODE === "demo" &&
  !["localhost", "127.0.0.1"].includes(new URL(config.APP_ORIGIN).hostname)
)
  throw new Error("Demo authentication requires a loopback app origin");

if (
  config.AUTH_MODE === "demo" &&
  (config.DATABASE_SECRET_ARN ||
    (config.DATABASE_URL &&
      !["localhost", "127.0.0.1"].includes(
        new URL(config.DATABASE_URL).hostname,
      )))
)
  throw new Error("Demo mode requires a loopback-only development database");

if (
  config.AUTH_MODE === "demo" &&
  (config.SMS_ENABLED === "true" ||
    config.EVENT_TOPIC_ARN ||
    config.EVIDENCE_BUCKET ||
    config.LOCATION_MAP_NAME ||
    config.LOCATION_PLACE_INDEX ||
    config.LOCATION_ROUTE_CALCULATOR ||
    config.ANALYTICS_BUCKET)
) {
  throw new Error(
    "Local demo mode cannot enable billable AWS integrations. Use the reviewed Cognito deployment configuration for cloud integration tests.",
  );
}
