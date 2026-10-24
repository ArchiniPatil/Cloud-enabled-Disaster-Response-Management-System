import pg from "pg";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { migrate } from "./migrations.js";
import { transaction } from "../apps/api/src/db.js";
import { config } from "../apps/api/src/config.js";
export async function prepareDatabase() {
  await migrate();
  if (!process.env.APP_DB_SECRET_ARN)
    throw new Error("APP_DB_SECRET_ARN is required");
  const result = await new SecretsManagerClient({
    region: config.AWS_REGION,
  }).send(
    new GetSecretValueCommand({ SecretId: process.env.APP_DB_SECRET_ARN }),
  );
  const credentials = JSON.parse(result.SecretString!);
  if (
    credentials.username !== "response_app" ||
    typeof credentials.password !== "string"
  )
    throw new Error("Unexpected runtime database secret format");
  await transaction(async (db) => {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('response:runtime-role'))",
    );
    if (
      !(await db.query("SELECT 1 FROM pg_roles WHERE rolname='response_app'"))
        .rowCount
    )
      await db.query(
        "CREATE ROLE response_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT",
      );
    await db.query(
      `ALTER ROLE response_app PASSWORD ${pg.escapeLiteral(credentials.password)}`,
    );
    await db.query(
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO response_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO response_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO response_app; REVOKE UPDATE,DELETE,TRUNCATE ON audit_events,incident_status_history,announcement_revisions FROM response_app; REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON schema_migrations FROM response_app",
    );
  });
}
