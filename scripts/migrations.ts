import { readdir, readFile } from "node:fs/promises";
import { transaction } from "../apps/api/src/db.js";
export async function migrate() {
  await transaction(async (db) => {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('response:migrations'))",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        !(
          await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      ) {
        await db.query(await readFile(`db/migrations/${name}`, "utf8"));
        await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
        console.log(JSON.stringify({ event: "migration_applied", name }));
      }
    }
  });
}
