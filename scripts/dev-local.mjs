import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const cognito = process.argv.includes("--cognito");
try {
  loadEnvFile(cognito ? ".env.cognito" : ".env");
} catch (error) {
  console.error(
    error.code === "ENOENT"
      ? cognito
        ? "Missing .env.cognito. Follow docs/ACADEMIC_DEMO.md to configure an existing Cognito pool."
        : "Local setup is incomplete: .env is missing. Run npm run setup:local successfully before starting the app."
      : `Cannot read .env: ${error.message}`,
  );
  process.exit(1);
}
if (process.env.AUTH_MODE !== (cognito ? "cognito" : "demo"))
  throw new Error(
    "Authentication mode does not match the selected startup command.",
  );
if (
  cognito &&
  [
    "COGNITO_POOL_ID",
    "COGNITO_CLIENT_ID",
    "COGNITO_DOMAIN",
    "SESSION_KEY",
  ].some((key) => !process.env[key])
)
  throw new Error(
    "Cognito settings are incomplete. Follow docs/ACADEMIC_DEMO.md.",
  );
if (!process.env.npm_execpath) {
  console.error("Start the application with npm run dev:local.");
  process.exit(1);
}
const windows = process.platform === "win32";
const child = spawn(
  process.execPath,
  [process.env.npm_execpath, "run", "dev"],
  { stdio: "inherit", env: { ...process.env }, detached: !windows },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (child.pid) {
      try {
        if (windows) child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        /* Child already exited. */
      }
    }
  });
child.on("error", () => {
  console.error("Unable to start npm; check the Node/npm installation.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
