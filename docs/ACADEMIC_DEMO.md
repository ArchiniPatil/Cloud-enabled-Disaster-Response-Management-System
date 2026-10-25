# Academic demonstration and AWS handoff

## Current status and account constraint

The user reports an AWS **Free plan, $120 remaining credits, and 169 days remaining**. This is user-provided billing information, not an API-verified balance. The cash budget remains **$0**. On 25 October 2026 the user instructed AWS setup after reviewing the 24-hour, $30-credit plan. This scope is now recorded as approved; AWS access and the alert/admin email remain missing. No account-plan upgrade, SMS sending or provisioning has been performed. Never treat service availability as proof that every feature or all usage is free.

The cloud workspace still cannot authenticate to AWS. Credentials on the user's Windows laptop are not available to this workspace. Run read-only checks from the laptop with its configured AWS CLI; never share access keys, passwords, tokens or MFA codes.

```powershell
npm run aws:preflight
```

The script prints the caller identity and project stack names, but does not create resources or query billable Cost Explorer APIs. Check Billing → Free Tier/Credits yourself for the current plan, applicable services, remaining credits, expiry, and charges.

## Choose a demonstration scope

| Option | What runs in AWS | What runs locally | Cost status |
|---|---|---|---|
| Existing local demo | Nothing | App, PostGIS, worker, four labeled fixture identities | No AWS usage |
| Real-account local demo | Cognito Lite user pool, app client, hosted sign-in | App, isolated PostGIS database, durable worker | Eligibility/usage must be reviewed; no SMS or full infrastructure |
| Hosted academic demonstration | ECS, RDS, private ALB, API Gateway/VPC Link, Cognito, S3, SNS/SQS, Lambda, Scheduler, Location, Amplify, ECR, Secrets Manager, CloudWatch, Budgets, Glue/Athena | Browser and deployment tools | Credit-consuming resources; explicit reviewed approval required |

The existing custom-domain reference and optional CodeBuild/CodePipeline definitions remain available. The academic hosted option uses default AWS HTTPS hostnames and does not require purchasing a domain. GitHub CI already verifies source. Connecting CodePipeline to a GitHub repository needs a separately authorized CodeConnections connection; it is not fabricated or auto-connected.

### Authorized hosted scope

- Region: `ap-south-1`; one academic stack, `DisasterResponse-academic`.
- One 0.25 vCPU / 0.5 GiB Fargate task (scaling ceiling two), one development RDS instance and 20 GiB initial storage, one NAT gateway, one internal ALB, and an API Gateway HTTP API/VPC Link.
- Small controlled test-user traffic; private evidence and aggregate analytics buckets; queues and dead-letter queue; bounded Lambda concurrency; no live SMS.
- Suggested duration: **one day, at most 24 hours**, followed by explicit cleanup and billing verification.
- Planning allowance: **up to $30 of credits**, with approximately **$5–15 for a light one-day run** as an unverified allowance, not a live regional price quote or a guarantee. Baseline infrastructure is roughly $120–200/month under the earlier unverified assumptions; builds, transfer, logs, taxes, retained resources and service eligibility can change totals.
- The budget resource tracks gross usage by excluding credits/refunds, and alerts at 80% of its $30 academic threshold. **It does not enforce a spending cap.** Project cost tags must be activated and billing data/notifications may be delayed.
- `maximumDemoHours` is a planning constraint, not an automatic shutdown timer. Assign a cleanup owner and set a calendar reminder before deployment.

The approved configuration is recorded in `config/academic-deployment.json`: provisioning enabled within the 24-hour/$30-credit scope. Verify the AWS identity, account plan, service eligibility and remaining credits before deploying. Do not ask for the same approval again. The older cash-funded deployment guard remains disabled.

## Option A: real Cognito accounts with the application on your laptop

This is separate from the four local demonstration buttons. It never stores passwords in the application database. Cognito handles registration, email verification, temporary invitation passwords, TOTP MFA and password recovery.

1. Install dependencies with `npm ci`. Keep Docker Desktop running.
2. Preview the identity template: `npm run identity:synth`. This requires no cloud provisioning.
3. After the identity-only plan and costs are approved, an operator can deploy `infra/identity.ts` using CDK and save outputs to `.local/identity-outputs.json`. CDK bootstrap is a separate provisioning step that must be included in the approval if the account is not already bootstrapped. Do not deploy both demonstration options unless both are needed and reviewed.
   After that explicit approval, the operator command is `npx cdk deploy ResponseAcademicIdentity --app "npx tsx infra/identity.ts" --output cdk.out/identity --outputs-file .local/identity-outputs.json --require-approval broadening`. Create `.local` first if necessary. This command creates AWS resources and is not part of the free local setup.
4. With outputs from the actual `ResponseAcademicIdentity` stack:

```powershell
node scripts/configure-cognito.mjs .local/identity-outputs.json
npm run setup:cognito
npm run dev:cognito
```

`configure-cognito.mjs` writes an ignored `.env.cognito`, generates an encryption key without printing it, and refuses to overwrite an existing file. `setup:cognito` creates the isolated `response_cognito` local database and applies real reference catalog migrations; it does **not** seed demo users. This prevents the fixture administrator from blocking the first real administrator bootstrap. The local durable worker processes database outbox events without SNS; this mode is prohibited in production.

5. Use the application's **Create a citizen account** link to register the intended administrator email, verify email, enroll an authenticator, and sign in. Then, from a second PowerShell window using an AWS principal allowed to call `cognito-idp:AdminGetUser` on that pool:

```powershell
node --env-file=.env.cognito --import tsx scripts/bootstrap-admin.ts "your-verified-email@example.com"
```

The command verifies enabled identity, verified email and TOTP, promotes the first administrator, invalidates the old session version, and refuses once an administrator exists. Sign in again after bootstrap. There is no public admin registration route or shared admin password.

6. In Administration, create a jurisdiction covering your test coordinates, an organization and a rescue team, then configure the team's qualifications. Invite separate authority and rescuer email addresses from Accounts, choosing the matching department, jurisdiction and team. Cognito generates the temporary password and sends it to the specified email; users replace it and enroll MFA. Public sign-up only creates citizens. Operational accounts cannot self-assign permissions.
7. Use **Resend invitation** only for an unaccepted invitation. Accepted accounts use **Forgot password?**. In-app suspension and scope changes immediately revoke sessions. If an upstream identity was created but a database/network failure interrupted provisioning, stop and reconcile that specific identity and its intended scope before retrying; do not delete unrelated identities or grant a role based on client input.

Local Cognito requires AWS CLI/SDK access for administrative invitation and bootstrap operations. Use a least-privilege local profile scoped to this user pool. The backend needs `AdminCreateUser`, `AdminGetUser`, `AdminEnableUser`, `AdminDisableUser`, and `AdminUserGlobalSignOut`. Browser authentication itself uses Cognito's hosted endpoints and public signing keys.

## Option B: the default-hostname AWS deployment

Preview the exact academic template and check its security properties:

```powershell
npm run cloud:plan
npx tsx scripts/verify-infra.ts cdk.out/academic/DisasterResponse-academic.template.json
```

No cloud resources are created by these commands. The academic template includes the aggregate analytics catalog. SMS is disabled. Provider delivery subscriptions are optional and require existing reviewed SNS log groups. The full infrastructure preview may take time to bundle assets.

The current user authorization records `provisioningApproved: true` and `creditAllowanceUsd: 30` in `config/academic-deployment.json`, with `cashBudgetUsd: 0` and `upgradeAccountPlan: false`. Confirm the region's CDK bootstrap already exists, or obtain approval for it first. Then:

```powershell
$env:AWS_BUDGET_EMAIL = "your-budget-alert-email@example.com"
$env:APPROVE_ACADEMIC_DEPLOYMENT = "REVIEWED_CREDIT_FUNDED_DEMO"
npm run cloud:deploy
```

The script checks caller identity, invokes the reviewed stack and saves outputs under ignored `.local/academic-outputs.json`. It does not change account plans or configure account-wide SMS. AWS can reject resources unavailable to the Free plan; do not upgrade automatically. The budget setting is an alert, not a credit reservation or hard cap.

Public traffic uses Amplify HTTPS and the API Gateway HTTPS endpoint. API Gateway reaches an **internal** ALB through a VPC Link; that private network hop uses HTTP, and the ALB-to-task hop remains private HTTP. RDS uses verified TLS. This demonstration tradeoff avoids a purchased origin certificate; it is not an end-to-end TLS production claim. Every private API remains subject to the same session, CSRF and role checks.

The academic application polls authorized incident and tracking endpoints every five seconds rather than holding SSE connections through API Gateway's request timeout. The custom-domain reference continues to use SSE. Coordinates retain their observed timestamp and stale indicator. A polling response is never treated as a new GPS observation.

### Publish the frontend after successful stack deployment

Use the actual outputs; never invent a URL. These PowerShell commands upload the compiled frontend to the stack's Amplify app:

```powershell
npm run build
$outputs = (Get-Content .local/academic-outputs.json -Raw | ConvertFrom-Json).'DisasterResponse-academic'
Compress-Archive -Path apps/web/dist/* -DestinationPath .local/frontend.zip -Force
$upload = aws amplify create-deployment --app-id $outputs.AmplifyAppId --branch-name dev --region ap-south-1 | ConvertFrom-Json
Invoke-WebRequest -Method Put -Uri $upload.zipUploadUrl -InFile .local/frontend.zip -ContentType 'application/zip' | Out-Null
aws amplify start-deployment --app-id $outputs.AmplifyAppId --branch-name dev --job-id $upload.jobId --region ap-south-1
aws amplify get-job --app-id $outputs.AmplifyAppId --branch-name dev --job-id $upload.jobId --region ap-south-1 --query 'job.summary.status'
```

Treat the temporary upload URL as a credential: do not print, commit or share it. Wait for the deployment job to succeed. Use the actual `ApplicationUrl` output; check its `/api/v1/health/ready`. The empty Amplify app does not become a working frontend merely because CloudFormation succeeded.

For first administrator bootstrap in the hosted stack, use the verified Cognito identity and the `MigrationFunctionName` output with the controlled `bootstrap-admin` invocation in `DEPLOYMENT.md`. Configure real operating data through the administrator UI; never run the fixture seed against a hosted database.

## Professor demonstration sequence

Use only test users, explicitly labeled test incidents and browser-controlled GPS or a disclosed test location. No emergency service is notified by this project.

1. Show citizen registration, verified email, MFA, logout and persistent-session sign-in. Explain that public registration has no privileged-role selector.
2. Administrator configures organization, department, jurisdiction, team, qualifications and stock; invites authority/rescuer accounts; demonstrates scope and permission restrictions.
3. Rescuer starts duty and shares location in a dedicated tab. Keep the tab open; automatic GPS can overwrite browser test coordinates unless the whole browser context uses the test location.
4. Citizen reports a medical test incident near the team. Authority sees only its authorized inbox, acknowledges, matches, offers an assignment and authorizes dispatch after acceptance.
5. Rescuer progresses en route → arrived → in progress → completed. Citizen sees authorized current/stale location, actual route ETA only when Location is configured, and final resolution.
6. Show no-team escalation, inventory allocation/release, announcement correction/withdrawal, qualification expiry and operational metrics.
7. Show audited administrative actions and that suspension revokes the target's session. A citizen cannot call administrator endpoints.
8. If hosted, show the actual queue/Lambda/CloudWatch/database/aggregate export resources and a controlled failure. Distinguish SDK-stubbed tests from live provider results.

## SMS and analytics boundaries

SMS remains off. A phone preference does not enable global sending. Before any controlled SMS test, verify sandbox destinations, regional support, sender/template requirements, prices, quotas, spending limits and explicit authorization. No real emergency alerts should be sent for the demonstration.

The delivery-receipt Lambda consumes an allowlisted CloudWatch Logs subscription, persists only provider message ID/outcome, deduplicates records and reconciles out-of-order receipts. A provider-reported delivery still does not mean a person read, accepted or dispatched a response. After approved account-level SNS delivery logging, existing log group names can be supplied with `-c smsDeliveryLogs=<success-group>,<failure-group>`. This code does not alter account-wide SNS SMS settings.

Analytics exports encrypted, de-identified daily incident aggregates plus team and inventory snapshots. Glue defines `incident_daily`, `teams_daily`, and `resources_daily`; Athena has a scan limit. These are snapshots at export time, not a claim that later incident resolutions rewrite historical exports. The live bounded metrics screen covers up to 90 days within the viewer's scope. No operational phone numbers, user emails or precise GPS tracks are exported.

## End the demonstration and verify remaining costs

Closing the browser or stopping ECS does not remove RDS, NAT, ALB, snapshots, S3 objects, ECR images, logs or secrets. Do not describe that as stopping billing.

1. Export any test results you want to retain. Disable further builds, schedules and test sending. Record the actual stack inventory: `npm run cloud:inventory`.
2. Review deletion with the owner. The reference stack protects/retains data deliberately. Disable RDS deletion protection only for the reviewed academic instance, then delete the reviewed stack through CloudFormation/CDK. Do not target an existing unrelated stack.
3. Explicitly inventory and, after approval, delete retained academic RDS instances/snapshots, all versions/delete markers in academic S3 buckets, ECR images/repositories, Cognito pools, CloudWatch log groups, secrets and any orphaned network resources. Deleting the stack alone is insufficient because retention policies preserve some resources.
4. Inspect the CDK bootstrap ECR/S3 resources separately; do not delete a shared bootstrap stack used by other projects.
5. Recheck Billing/Free Tier usage and the credits balance after usage data catches up. Confirm no running instances, NAT gateways, ALBs, scheduled jobs or retained billable storage remain for this demonstration. Credits already consumed are not refunded by deleting resources.

No cleanup or deletion is executed by the read-only inventory command.
