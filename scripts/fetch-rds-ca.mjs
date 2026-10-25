import { X509Certificate } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const response = await fetch(
  "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem",
  { signal: AbortSignal.timeout(30000), redirect: "error" },
);
if (!response.ok)
  throw new Error(`RDS CA download failed: HTTP ${response.status}`);
const bundle = await response.text();
const certificates = bundle.match(
  /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
);
if (!certificates?.length)
  throw new Error("The download contains no PEM certificates.");
for (const certificate of certificates) new X509Certificate(certificate);
mkdirSync("certs", { recursive: true });
const temporary = `certs/.rds-global-${process.pid}.tmp`;
try {
  writeFileSync(temporary, bundle, { flag: "wx" });
  renameSync(temporary, "certs/rds-global.pem");
} finally {
  rmSync(temporary, { force: true });
}
console.log(
  "Official AWS RDS CA bundle downloaded over verified HTTPS and parsed. Rebuild deployment artifacts before use.",
);
