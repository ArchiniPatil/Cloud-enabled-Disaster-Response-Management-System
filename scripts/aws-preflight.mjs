import { spawnSync } from "node:child_process";

process.env.AWS_PAGER = "";
const region = process.env.AWS_REGION || "ap-south-1";
function read(args) {
  const result = spawnSync(
    "aws",
    [...args, "--region", region, "--output", "json"],
    { encoding: "utf8", timeout: 30000 },
  );
  if (result.error || result.status !== 0) {
    console.error(
      "AWS read-only check failed. Check AWS CLI installation, the selected profile, and its permissions. Configure credentials locally; never paste them into chat.",
    );
    if (result.error) console.error(result.error.message);
    if (result.stderr?.trim()) console.error(result.stderr.trim());
    process.exit(1);
  }
  return JSON.parse(result.stdout);
}
const identity = read(["sts", "get-caller-identity"]);
console.log(
  JSON.stringify(
    { region, account: identity.Account, principal: identity.Arn },
    null,
    2,
  ),
);
console.log(
  "Identity confirmed. This does not verify Free Tier eligibility or authorize provisioning.",
);
console.log(
  "In AWS Billing, check account plan, remaining credits, expiry, Free Tier usage and current charges. No credits or prices are assumed by this script.",
);
const stacks = read([
  "cloudformation",
  "list-stacks",
  "--query",
  "StackSummaries[?starts_with(StackName, 'DisasterResponse') || starts_with(StackName, 'ResponseAcademic')].{name:StackName,status:StackStatus}",
]);
console.log(JSON.stringify({ projectStacks: stacks }, null, 2));
console.log("No resources were created, changed, or deleted.");
