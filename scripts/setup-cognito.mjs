import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
loadEnvFile(".env.cognito");
if (
  process.env.AUTH_MODE !== "cognito" ||
  process.env.NODE_ENV === "production" ||
  !process.env.DATABASE_URL ||
  new URL(process.env.DATABASE_URL).pathname !== "/response_cognito" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
)
  throw new Error(
    "Use the isolated local response_cognito database from configure-cognito.mjs.",
  );
function run(command, args, capture = false) {
  const r = spawnSync(command, args, {
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    env: process.env,
  });
  if (r.error || r.status !== 0)
    throw new Error(
      "Database setup failed. Check Docker Desktop and the output above.",
    );
  return r.stdout?.trim();
}
run("docker", ["compose", "up", "-d", "--wait", "db"]);
const exists = run(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "response",
    "-d",
    "postgres",
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname='response_cognito'",
  ],
  true,
);
if (exists !== "1")
  run("docker", [
    "compose",
    "exec",
    "-T",
    "db",
    "createdb",
    "-U",
    "response",
    "response_cognito",
  ]);
run(process.execPath, ["--import", "tsx", "scripts/migrate.ts"]);
console.log(
  "Cognito demonstration database prepared. No demonstration users were seeded. Run npm run dev:cognito.",
);
