import { readFileSync, writeFileSync, constants } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: node scripts/configure-cognito.mjs <CDK outputs JSON file>",
  );
const all = JSON.parse(readFileSync(file, "utf8"));
const values = all.ResponseAcademicIdentity;
if (
  !values ||
  !/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/.test(values.UserPoolId) ||
  !/^[a-z0-9]+$/.test(values.ClientId) ||
  !/^https:\/\/[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com$/.test(
    values.LoginDomain,
  ) ||
  !/^[a-z]{2}-[a-z]+-\d$/.test(values.Region)
)
  throw new Error("Expected validated ResponseAcademicIdentity outputs.");
const contents = [
  "NODE_ENV=development",
  "AUTH_MODE=cognito",
  "EVENT_TRANSPORT=database",
  "DATABASE_URL=postgresql://response:local-development-only@127.0.0.1:5432/response_cognito",
  "APP_ORIGIN=http://localhost:5173",
  "API_ORIGIN=http://localhost:4000",
  "PORT=4000",
  "SMS_ENABLED=false",
  `AWS_REGION=${values.Region}`,
  `COGNITO_POOL_ID=${values.UserPoolId}`,
  `COGNITO_CLIENT_ID=${values.ClientId}`,
  `COGNITO_DOMAIN=${values.LoginDomain}`,
  `SESSION_KEY=${randomBytes(48).toString("base64url")}`,
  "",
].join("\n");
// Never overwrite an existing encryption key or a configured environment.
writeFileSync(".env.cognito", contents, {
  flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
  mode: 0o600,
});
console.log(
  "Created ignored .env.cognito with a fresh local session-encryption key. See docs/ACADEMIC_DEMO.md for database preparation and administrator bootstrap.",
);
