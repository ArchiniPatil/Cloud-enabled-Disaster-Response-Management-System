import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const policy = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../config/deployment-policy.json", import.meta.url)),
    "utf8",
  ),
);
if (!policy.allowPaidAwsDeployment || !(policy.monthlyBudgetUsd > 0)) {
  console.error(
    "Deployment blocked: the approved AWS budget is $0. The separate credit-funded deployment uses npm run cloud:deploy. Free Tier does not guarantee the Fargate/ALB/NAT/RDS stack is free. A reviewed nonzero budget and explicit approval are required before changing deployment-policy.json.",
  );
  process.exit(1);
}
