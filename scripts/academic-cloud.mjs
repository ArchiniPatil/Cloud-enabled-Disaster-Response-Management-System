import { readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2] ?? "plan";
const policy = JSON.parse(
  readFileSync("config/academic-deployment.json", "utf8"),
);
process.env.AWS_PAGER = "";
process.env.AWS_REGION = policy.region;
process.env.AWS_DEFAULT_REGION = policy.region;
function run(command, args) {
  const r = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (r.error || r.status !== 0) process.exit(r.status || 1);
}
if (!["plan", "deploy", "inventory"].includes(mode))
  throw new Error("Use plan, deploy, or inventory.");
if (mode === "inventory") {
  run("aws", [
    "cloudformation",
    "list-stack-resources",
    "--stack-name",
    "DisasterResponse-academic",
    "--region",
    policy.region,
    "--query",
    "StackResourceSummaries[].{type:ResourceType,id:PhysicalResourceId,status:ResourceStatus}",
    "--output",
    "table",
  ]);
} else {
  if (mode === "deploy") {
    if (
      !policy.provisioningApproved ||
      !(policy.creditAllowanceUsd > 0) ||
      policy.cashBudgetUsd !== 0 ||
      policy.upgradeAccountPlan ||
      process.env.APPROVE_ACADEMIC_DEPLOYMENT !== "REVIEWED_CREDIT_FUNDED_DEMO"
    ) {
      console.error(
        "Deployment blocked. Review docs/ACADEMIC_DEMO.md, current account credits, the resource/cost plan and cleanup. Explicit approval must be recorded before provisioning. No account-plan upgrade or cash spend is authorized.",
      );
      process.exit(1);
    }
    if (!process.env.AWS_BUDGET_EMAIL)
      throw new Error("Set AWS_BUDGET_EMAIL to your budget-alert email.");
    run("aws", ["sts", "get-caller-identity", "--region", policy.region]);
  }
  mkdirSync(".local", { recursive: true });
  const cdk = fileURLToPath(
    new URL("../node_modules/aws-cdk/bin/cdk", import.meta.url),
  );
  const args = [
    cdk,
    mode === "plan" ? "synth" : "deploy",
    "DisasterResponse-academic",
    "--app",
    "npx tsx infra/app.ts",
    "-c",
    "hosting=academic",
    "-c",
    "analytics=true",
    "--output",
    "cdk.out/academic",
  ];
  if (process.env.AWS_EMAIL_FROM) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.AWS_EMAIL_FROM))
      throw new Error("AWS_EMAIL_FROM must be a verified SES email identity");
    args.push("-c", `emailFrom=${process.env.AWS_EMAIL_FROM}`);
  }
  if (process.env.AWS_GIT_CONNECTION_ARN) {
    if (
      !/^arn:aws:(?:codeconnections|codestar-connections):[a-z0-9-]+:[0-9]{12}:connection\/[a-zA-Z0-9-]+$/.test(
        process.env.AWS_GIT_CONNECTION_ARN,
      )
    )
      throw new Error(
        "AWS_GIT_CONNECTION_ARN must be an existing approved AWS connection ARN.",
      );
    args.push("-c", "pipeline=true");
    if (mode === "deploy")
      args.push(
        "--parameters",
        `GitConnectionArn=${process.env.AWS_GIT_CONNECTION_ARN}`,
      );
  }
  if (mode === "deploy")
    args.push(
      "--parameters",
      `BudgetEmail=${process.env.AWS_BUDGET_EMAIL}`,
      "--parameters",
      `BudgetAmount=${policy.creditAllowanceUsd}`,
      "--outputs-file",
      ".local/academic-outputs.json",
      "--require-approval",
      "broadening",
    );
  else {
    args.push("--quiet", "--lookups=false", "-c", "offlinePreview=true");
    console.log(
      "Offline, environment-agnostic preview. Deployment resolves the actual account, region and availability zones separately.",
    );
  }
  run(process.execPath, args);
}
