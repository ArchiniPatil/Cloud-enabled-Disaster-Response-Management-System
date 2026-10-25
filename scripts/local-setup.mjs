import {
  copyFileSync,
  constants,
  mkdirSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command === process.execPath ? "Node/npm" : command} failed. ${result.error?.message ?? "See the output above."}`,
    );
  }
  return result.stdout?.trim();
}

try {
  if (!process.env.npm_execpath)
    throw new Error("Run this script with npm run setup:local.");
  // Fail early with a useful message before installing dependencies.
  try {
    run("docker", ["compose", "version"]);
    run("docker", ["info"], true);
  } catch {
    throw new Error(
      "Docker is unavailable. Install/start Docker Desktop with Linux containers, wait until it is running, then retry npm run setup:local.",
    );
  }
  mkdirSync(".local/npm-cache", { recursive: true });
  run(process.execPath, [
    process.env.npm_execpath,
    "ci",
    "--cache",
    fileURLToPath(new URL("../.local/npm-cache", import.meta.url)),
  ]);
  if (!process.argv.includes("--demo")) {
    if (!existsSync(".env.cognito"))
      throw new Error(
        "Real-account setup requires .env.cognito from actual Cognito outputs. Follow docs/ACADEMIC_DEMO.md; no sample accounts have been created.",
      );
    run(process.execPath, ["scripts/setup-cognito.mjs"]);
    console.log("Real-account local setup complete. Run npm run dev:local.");
    process.exit(0);
  }
  try {
    copyFileSync(".env.demo.example", ".env.demo", constants.COPYFILE_EXCL);
    if (process.platform !== "win32") chmodSync(".env.demo", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  loadEnvFile(".env.demo");
  if (
    process.env.AUTH_MODE !== "demo" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "Test-fixture setup requires AUTH_MODE=demo outside production. Check .env.demo and your terminal environment.",
    );
  }
  run("docker", ["compose", "up", "-d", "--wait", "db"]);
  run(process.execPath, ["--import", "tsx", "scripts/migrate.ts"]);
  run(process.execPath, ["--import", "tsx", "scripts/seed.ts"]);
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
      "SELECT 1 FROM pg_database WHERE datname='response_test'",
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
      "response_test",
    ]);
  console.log(
    "Test-fixture setup complete. Run npm run dev:demo to use sample accounts.",
  );
} catch (error) {
  console.error(`Setup stopped: ${error.message}`);
  process.exitCode = 1;
}
