import pg from "pg";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { config } from "./config.js";
export type DB = pg.PoolClient;
let options: pg.PoolConfig = {
  connectionString:
    config.DATABASE_URL ??
    "postgresql://response:local-development-only@127.0.0.1:5432/response",
  max: 10,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
};
if (config.DATABASE_SECRET_ARN) {
  const r = await new SecretsManagerClient({ region: config.AWS_REGION }).send(
    new GetSecretValueCommand({ SecretId: config.DATABASE_SECRET_ARN }),
  );
  const s = JSON.parse(r.SecretString!);
  options = {
    ...options,
    connectionString: undefined,
    host: s.host,
    port: s.port,
    user: s.username,
    password: s.password,
    database: s.dbname ?? "response",
    ssl: { rejectUnauthorized: true },
  };
}
if (config.SESSION_SECRET_ARN) {
  const key = await new SecretsManagerClient({
    region: config.AWS_REGION,
  }).send(new GetSecretValueCommand({ SecretId: config.SESSION_SECRET_ARN }));
  config.SESSION_KEY = key.SecretString;
}
export const pool = new pg.Pool(options);
pool.on("error", () =>
  console.error(JSON.stringify({ event: "database_pool_error" })),
);
export async function transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function audit(
  db: DB,
  actor: string | null,
  action: string,
  type: string,
  id: string,
  details: Record<string, unknown> = {},
) {
  await db.query(
    "INSERT INTO audit_events(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)",
    [actor, action, type, id, JSON.stringify(details)],
  );
}
export async function outbox(
  db: DB,
  type: string,
  payload: Record<string, unknown>,
  key: string,
) {
  await db.query(
    "INSERT INTO outbox_events(type,payload,dedupe_key) VALUES($1,$2,$3) ON CONFLICT(dedupe_key) DO NOTHING",
    [type, JSON.stringify(payload), key],
  );
}
