import { mkdirSync, cpSync, chmodSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
const output = resolve(process.argv[2]);
mkdirSync(join(output, "certs"), { recursive: true });
cpSync("certs/rds-global.pem", join(output, "certs/rds-global.pem"));
if (process.argv.includes("--database"))
  cpSync("db", join(output, "db"), { recursive: true });
function readable(p) {
  const dir = statSync(p).isDirectory();
  chmodSync(p, dir ? 0o755 : 0o644);
  if (dir) for (const child of readdirSync(p)) readable(join(p, child));
}
if (process.platform !== "win32") readable(output);
