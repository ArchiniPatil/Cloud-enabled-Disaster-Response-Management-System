# Deploy and operate the project from VS Code on Windows

Use PowerShell in the repository root. This guide deploys the **full default-hostname stack** in Mumbai (`ap-south-1`): Amplify → API Gateway → private ALB → ECS/Fargate → private RDS/PostGIS, with Cognito, S3, SNS/SQS, Lambda, Scheduler, Location, Secrets Manager, monitoring and analytics. You do not need to buy a domain.

The source and local tests are available; **this deployment has not yet been executed successfully in AWS**. On 25 October 2026, STS and the Free Tier API worked, but CloudFormation inventory was explicitly denied by Organizations SCP `p-7hvdp5n3`. The account API reported an ACTIVE FREE plan, $120 credits, and expiry on 10 April 2027. Recheck these values before you deploy. Deploying from a laptop does not bypass that account policy.

Follow the numbered steps in order. Run each command separately and stop on an error. Keep all AWS keys/passwords/MFA codes out of Git, screenshots and chat.

## 1. Prepare your workstation and AWS access

Install Node 22+, Git, Docker Desktop with Linux containers, VS Code and AWS CLI v2. Open the folder containing the root `package.json`:

```powershell
node --version
docker info
docker compose version
aws --version
npm ci
New-Item -ItemType Directory -Force .local | Out-Null
$env:AWS_REGION = 'ap-south-1'
$env:AWS_DEFAULT_REGION = 'ap-south-1'
$env:AWS_PAGER = ''
```

Use your existing approved AWS CLI profile. If it is the default profile, no profile variable is needed. For a named profile:

```powershell
$env:AWS_PROFILE = 'your-existing-profile-name'
# Only for an IAM Identity Center profile:
aws sso login --profile $env:AWS_PROFILE
```

If you need initial setup, use AWS's supported CLI/Identity Center configuration locally (`aws configure sso`, or your organization's approved credential method). Do not use root access keys. The deployer needs CloudFormation and CDK bootstrap/asset permissions, permission to create/pass the stack's IAM roles, and provisioning permissions for the services in Step 8. Runtime roles are created separately with narrower permissions.

```powershell
aws sts get-caller-identity --region ap-south-1
npm run aws:preflight
aws freetier get-account-plan-state --region us-east-1
```

**Stop if CloudFormation returns an explicit deny.** Ask the organization administrator to review the policy; if you do not manage that organization, ask AWS Support whether the restriction can be resolved while retaining the Free plan. IAM AdministratorAccess cannot override an SCP. Do not switch to direct service provisioning to evade it. Do not upgrade your account automatically.

If the Free Tier command is unavailable in your CLI version or denied, inspect Billing → Free Tier/Credits in the console. An STS success verifies credentials, not permission to deploy every service.

## 2. Review resources, cost and the teardown time

The checked-in policy authorizes a **24-hour run, up to $30 of credits, $0 cash spend, no plan upgrade or domain purchase, and SMS disabled**. This is a planning allowance, not an automatic spending cap or shutdown timer. Set your own teardown reminder before deploying.

This stack includes continuously billed resources: one NAT gateway, internal ALB, one small Fargate task (scaling ceiling two), and a private RDS PostgreSQL instance with storage/backups. Additional usage comes from logs, secrets, maps, builds, storage, requests and analytics. The earlier $5–15 light one-day estimate is unverified, not a current price quote. Use the [AWS Pricing Calculator](https://calculator.aws/) and your account's service eligibility before starting. Credits and budget emails do not guarantee zero charges.

In Billing, activate the **Project** cost-allocation tag for tagged budget reporting when it becomes available. The stack creates a $30 gross-usage budget with an 80% email alert. Tag activation and billing records can lag. Review account-wide charges separately.

```powershell
$env:AWS_BUDGET_EMAIL = 'your-alert-email@example.com'
$env:APPROVE_ACADEMIC_DEPLOYMENT = 'REVIEWED_CREDIT_FUNDED_DEMO'
```

Use your chosen administrator/alert email. These variables are configuration, not AWS credentials. You must still review the deployment plan. The default hosted stack does not create CodeBuild/CodePipeline; Step 10 enables them after a GitHub connection and extra cost review. SNS events work without enabling SMS.

## 3. Verify source and preview infrastructure

Run the local verification sequence in [START_HERE.md](../START_HERE.md). Docker must be running to build the backend image during deployment. The official RDS CA bundle is included in `certs/rds-global.pem`; retain TLS verification.

```powershell
npm run cloud:plan
npx tsx scripts/verify-infra.ts cdk.out/academic/DisasterResponse-academic.template.json
```

Inspect `cdk.out/academic/DisasterResponse-academic.template.json`, especially IAM, networking, retained data, resource sizes and budget. The helper uses an environment-agnostic offline preview with account lookups disabled; deployment resolves the actual account, region and availability zones separately. No cloud provisioning occurs during synthesis. The assertion script checks private/encrypted database settings, MFA, queue redrive, scheduling, private tasks, the gateway/private ALB, metric-log references and secret-free outputs.

If the CA bundle needs refreshing, download only the official file, parse it before replacing the included file, then rebuild:

```powershell
node scripts/fetch-rds-ca.mjs
```

Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` or disable PostgreSQL certificate verification.

## 4. Bootstrap CDK in the selected account and region

Check whether `CDKToolkit` already exists in CloudFormation in Mumbai. If present and compatible, reuse it; do not delete a shared bootstrap stack. If absent, bootstrap once after reviewing its IAM roles, S3 bucket and ECR asset repository:

```powershell
$account = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0 -or $account -notmatch '^\d{12}$') { throw 'AWS identity check failed' }
npx cdk bootstrap "aws://$account/ap-south-1"
```

Bootstrap creates AWS resources and deployment roles. It does not create the application. If denied or unavailable on the account plan, stop and resolve that prerequisite; do not upgrade the plan or grant root credentials to the application.

## 5. Deploy the application infrastructure

```powershell
npm run cloud:deploy
```

Review the CDK IAM/security changes when prompted. The helper builds/uploads assets, creates `DisasterResponse-academic`, and writes actual stack outputs to ignored `.local/academic-outputs.json`. Provisioning RDS, networking and ECS can take tens of minutes. Keep the terminal open.

The migration Lambda creates PostGIS, the schema/reference catalog, and a limited application database role before ECS starts. **It does not create sample users or run the fixture seed.** Generated database/session secrets stay in Secrets Manager.

If deployment fails, open CloudFormation → `DisasterResponse-academic` → **Events**, find the first failed resource, and fix that reason before retrying. Do not repeatedly deploy blindly. Check for retained resources after rollback; RDS/S3/identity retention can leave resources and costs behind. A failed initial stack in `ROLLBACK_COMPLETE` requires deliberate recovery/removal after inspecting its resources; do not delete unrelated stacks.

Common blockers include SCP/IAM denial, unsupported Free-plan features, unavailable RDS engine/class combinations, Fargate quotas, Lambda concurrency quotas, unavailable Location data providers, Docker build errors or database migration failure. These require real account evidence; local synthesis cannot prove they will succeed.

## 6. Publish the frontend and check the actual URL

CloudFormation creates the Amplify app and `dev` branch; it does not upload the React build. The provided PowerShell helper verifies that local outputs match the current deployed stack, builds the source, uploads the frontend, waits for Amplify and checks API readiness:

```powershell
# Run in PowerShell. If Windows marked the downloaded script as blocked,
# inspect it first and use Unblock-File on this one file if permitted by your policy.
& .\scripts\publish-frontend.ps1
```

Do not change a corporate execution policy. If local script execution is prohibited, use the equivalent individual upload commands in [ACADEMIC_DEMO.md](ACADEMIC_DEMO.md). Do not print or share the temporary `zipUploadUrl`.

After success:

```powershell
$outputs = (Get-Content .local/academic-outputs.json -Raw | ConvertFrom-Json).'DisasterResponse-academic'
Start-Process $outputs.ApplicationUrl
Invoke-RestMethod "$($outputs.ApplicationUrl)/api/v1/health/ready"
aws ecs describe-services --cluster $outputs.ClusterName --services $outputs.ServiceName --region ap-south-1 --query 'services[].{status:status,running:runningCount,desired:desiredCount}'
```

Only use the URL returned by your deployment. The public frontend and gateway use HTTPS; private gateway→ALB→task hops use HTTP within restricted security groups. RDS uses verified TLS. This classroom hosting option is not an end-to-end TLS or high-availability production deployment. Authorized status/location updates poll every five seconds; the custom-domain reference supports SSE. API Gateway WebSockets are not provisioned; the original prompt permits a documented alternative.

## 7. Create real users and the first administrator

1. Open the deployed application and choose **Create a citizen account**.
2. Register your intended administrator email, verify the email, set a strong password and enroll a TOTP authenticator. Complete sign-in. Do not send the password or authenticator codes to anyone.
3. Promote that verified identity using the privileged migration function. There is no public admin registration or default admin password.

```powershell
$outputs = (Get-Content .local/academic-outputs.json -Raw | ConvertFrom-Json).'DisasterResponse-academic'
$adminEmail = Read-Host 'Enter the email you just verified and enrolled in TOTP'
$payload = @{ action = 'bootstrap-admin'; username = $adminEmail } | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $PWD '.local/bootstrap.json'), $payload, (New-Object Text.UTF8Encoding($false)))
$invoke = aws lambda invoke --region ap-south-1 --function-name $outputs.MigrationFunctionName --payload fileb://.local/bootstrap.json .local/bootstrap-result.json --output json
if ($LASTEXITCODE -ne 0) { throw 'Lambda invocation failed' }
$metadata = $invoke | ConvertFrom-Json
if ($metadata.FunctionError) { Get-Content .local/bootstrap-result.json; throw 'Administrator bootstrap failed' }
Get-Content .local/bootstrap-result.json
```

The action requires enabled identity, verified email and TOTP. It refuses once an administrator exists. Sign out and back in after promotion; the previous session is revoked. Restrict this function's invocation to the operator afterward. Do not expose it as an API endpoint.

In Administration:

- Review reference departments/categories and escalation policies.
- Create a jurisdiction polygon covering the area used in your evaluation.
- Create an organization and rescue teams, capacities, department/jurisdiction assignments and current qualifications.
- Create resource inventory and explicitly publish shelter/resource locations if desired.
- Invite authority and rescuer users using separate real inboxes and their specific scopes. Cognito sends temporary credentials; invitees replace them and enroll MFA. Public signup cannot grant these roles.
- Use **Resend invitation** only for pending invitations. Active users use password recovery. Suspending an account or changing its scope revokes its sessions.

Confirm the separate SNS operational-alert email subscription in your inbox. This is distinct from Cognito email verification and budget notification configuration.

## 8. Verify each provisioned AWS service through the application

In CloudFormation → stack → **Resources**, use physical resource IDs to find the exact project resources. Do not guess bucket/function names or inspect unrelated data. `npm run cloud:inventory` lists the project's resources without deleting them.

| Service | How it is wired | What you should actually verify |
|---|---|---|
| Amplify Hosting | React static build, `dev` branch and same-origin `/api/*` rewrite | Page loads on the actual HTTPS URL; nested routes reload; login redirects and cookies work through the frontend. Republish after frontend changes. |
| API Gateway HTTP API / VPC Link | HTTPS endpoint connects to the internal ALB | Frontend `/api/v1/health/ready` returns success; unauthorized private routes reject access. API Gateway WebSockets are intentionally replaced with authorized polling in this variant. |
| ALB / VPC / security groups | Internal load balancer, private tasks, isolated DB, one NAT, S3 endpoint | Target group has healthy targets; RDS is not public; task public IPs are disabled. Do not open port 5432 to the Internet. |
| ECS / Fargate | Express API container, task role, health checks, rollback and bounded scaling | Desired/running counts match; inspect service events and API logs; create/read an incident across a task restart to verify persistence. |
| ECR | CDK bootstrap repository holds the initial image; project repository serves the optional pipeline | Image exists and scans are reviewed. Merely creating the project ECR repository does not imply the initial task uses it. |
| RDS PostgreSQL / PostGIS | Encrypted DB with migrations, spatial indexes, backups and restricted runtime role | Real reports persist, department/jurisdiction filtering works, duplicate capacity allocations fail; review migrations/logs. Test restore into a separate private instance only after reviewing its extra cost. |
| Cognito | Citizen signup, operational invitations, verification, TOTP, PKCE and recovery | Signup, email verification, invitation acceptance, login, recovery, logout, session renewal and account suspension; never edit privileged roles in browser requests. |
| S3 evidence | Private bucket, signed upload/finalization and scoped download | Upload a small supported image through an authorized incident; another unrelated citizen must not access it. Bucket/object access stays private. No malware/EXIF scanner is included. |
| SNS event topic | Transactional outbox publishes incident/status events to SQS | Submit a labeled incident and inspect worker processing/logs. SNS event fanout does not require SMS registration. |
| SQS / DLQ | Durable delivery, partial-batch processing, five-attempt redrive | Normal messages are consumed; inspect queue age/dead letters. Use a controlled test event and inspect/redrive it only after fixing its failure. Do not purge queues to hide errors. |
| Lambda | Worker, migration/admin bootstrap and optional SMS receipt consumer | Check invocations/errors/logs; only invoke supported administrative actions. Worker `{}` runs one bounded scheduled tick. |
| EventBridge Scheduler | Runs worker every minute for durable deadlines/outbox/cleanup/exports | Let a labeled incident miss its configured deadline; verify escalation and audit history even after an API restart. This is not a guaranteed sub-minute scheduler. |
| Amazon Location | Map, place index and route calculator with authenticated backend calls | Search a Mumbai address, select a point, share fresh responder coordinates, and verify map tiles/route ETA. Confirm provider support/terms; stale or unavailable routes must not become invented ETAs. |
| IAM | Separate task, worker, migrator, scheduling and deployment roles | Application containers use roles, not your CLI keys. Inspect denied operations and grant only required service permissions; do not attach administrator access to runtime roles. |
| Secrets Manager | Generated owner/runtime DB credentials and session key | References exist and roles can retrieve only required secrets. Do not copy secret values into the frontend, CDK outputs or Git. |
| CloudWatch / SNS alerts | Structured logs, dashboard, queue/worker/API/DB alarms and operational email | Open dashboard `response-academic`, inspect failed-request/worker events, confirm email subscription and test alert delivery with a controlled alarm exercise. Never log tokens or full personal data. |
| Budgets | Tagged gross-usage threshold and email | Activate tags, verify notification address and check account-wide billing/credits. The budget does not shut down resources. |
| S3 analytics / Glue / Athena | Daily de-identified incident/team/resource exports and three external tables | Follow Step 9. The live operational metrics page uses scoped bounded SQL; large historical queries use Athena. |
| CodeBuild / CodePipeline | Optional GitHub source, test/build, ECR image, manual approval and ECS deployment | Follow Step 10; they are not enabled in the default stack. |

## 9. Use analytics in S3, Glue and Athena

`cloud:plan` and `cloud:deploy` include `analytics=true`. The worker exports daily data to a separate encrypted private bucket; Glue creates database **`response_academic`** and tables **`incident_daily`**, **`teams_daily`**, **`resources_daily`**. Athena workgroup **`response-academic`** uses encrypted query results and a 1 GB scan cutoff.

1. Create clearly labeled incidents, teams and resources through the app.
2. Inspect the worker's successful scheduled ticks and the analytics bucket's `daily/`, `teams/` and `resources/` prefixes. Incident exports cover the previous UTC day; same-day incidents will not immediately appear. Team/resource datasets are snapshots and a completed day is not repeatedly rewritten. Use the live Metrics page for today's workflow.
3. Open Athena → Query editor → select workgroup `response-academic`, data source `AwsDataCatalog`, database `response_academic`.
4. Your operator/query role needs access to this catalog, this bucket/results prefix and the workgroup. An application role is not automatically a human analyst role.
5. Run bounded queries after the corresponding export exists:

```sql
SELECT day, category, severity, status, incident_count,
       acknowledgement_seconds, arrival_seconds, resolution_seconds, escalated_count
FROM response_academic.incident_daily
ORDER BY day DESC
LIMIT 100;

SELECT day, department_id, availability, team_count, capacity,
       active_assignments, completed_assignments
FROM response_academic.teams_daily
ORDER BY day DESC
LIMIT 100;

SELECT day, department_id, type, status, quantity, allocated
FROM response_academic.resources_daily
ORDER BY day DESC
LIMIT 100;
```

Queries consume credits based on scanned data. `LIMIT` alone does not prevent scanning the dataset; the workgroup cutoff is the enforced scan safeguard. No QuickSight dashboard or external BI integration is included. Incident aggregates currently group category/severity/status, not geography; geographic incident analytics would require a reviewed de-identified export/schema extension.

## 10. Enable CodeBuild and CodePipeline

This creates additional services/build usage. Check Free-plan availability and costs before enabling. It does not automatically connect your GitHub account or deploy on every push.

1. In AWS Developer Tools → **Connections** (CodeConnections), create a GitHub connection in Mumbai, authorize only the intended repository through GitHub, and complete the connection until its status is **AVAILABLE**. Never put a GitHub token in source/CDK context.
2. Copy its nonsecret connection ARN into the current PowerShell session:

```powershell
$env:AWS_GIT_CONNECTION_ARN = 'arn:aws:codeconnections:ap-south-1:YOUR_ACCOUNT:connection/YOUR_CONNECTION_ID'
npm run cloud:plan
npx tsx scripts/verify-infra.ts cdk.out/academic/DisasterResponse-academic.template.json
# Keep the budget/approval variables from Step 2 set, then review and deploy:
npm run cloud:deploy
```

Replace the entire ARN with your actual connection ARN. The helper validates its form, enables `pipeline=true`, and passes `GitConnectionArn`. **Keep this variable set on subsequent deployments of this variant**; omitting it synthesizes a stack without the pipeline and would propose removing those resources. Never approve an unexpected deletion in the diff.

3. Open CodePipeline → `response-academic`. Source points to `ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System`, branch `main`; if you fork the repository, change the source owner/repository in `infra/app.ts` before deployment.
4. Manually release a change. CodeBuild runs frozen installation, PostgreSQL tests, lint/build, dependency audit and Docker image build/push to project ECR. Inspect the build result; current `buildspec.yml` does not run the Playwright suite. Browser tests remain a separate release acceptance step.
5. Review the **Approval** stage before ECS deployment. The pipeline uses immutable image tags and produces `imagedefinitions.json`; new database migrations must first be deployed through the reviewed CDK migration path. It cannot apply arbitrary schema changes by updating the container alone.
6. Check ECS health and the user workflow after deployment. Publish frontend changes separately with `publish-frontend.ps1`; this optional pipeline currently deploys the backend only. Amplify Git-based frontend auto-deployment is not configured by this manual-hosting stack.

## 11. SMS: activation requirements and current boundary

The real SNS SMS adapter, notification jobs, bounded retries and optional delivery-receipt Lambda are included. **Sending is disabled by default and was not authorized or tested in this account.** SNS topic→SQS event processing remains active independently.

Before any SMS activation, verify current Mumbai/recipient-country availability, SNS/End User Messaging sandbox status, verified test phone numbers, sender registration, applicable India DLT entity/header/template requirements, costs and a small account spending limit. A provider submission is not delivery or responder acceptance.

The current CDK stack deliberately sets `SMS_ENABLED` to `false` and does not grant direct-phone `sns:Publish` to the worker. Activation requires an explicit reviewed source/configuration change to enable that flag and grant direct-phone publishing to the worker role only. SNS direct-phone publishing requires a wildcard resource grant; do not extend it to browser users or all application roles. The adapter's fixed message in `apps/api/src/jobs.ts` currently supplies `AWS.SNS.SMS.SMSType=Transactional`; registered sender/entity/template attributes must be implemented to match your provider-approved template before sending where required. This country-specific configuration is not completed by downloading the project.

After approved SNS delivery logging is configured, the existing receipt handler can subscribe to the account's reviewed success/failure CloudWatch log groups. Preview/deploy the same academic stack with:

```powershell
# Substitute only actual reviewed SNS delivery log group names.
# This is a preview; it does not enable SMS sending.
npx cdk synth DisasterResponse-academic --app 'npx tsx infra/app.ts' -c hosting=academic -c analytics=true -c 'smsDeliveryLogs=sns/ap-south-1/ACCOUNT/DirectPublishToPhoneNumber,sns/ap-south-1/ACCOUNT/DirectPublishToPhoneNumber/Failure' --output cdk.out/sms-review --quiet
```

Use real account digits in the log names; the template validates them. Preserve the same pipeline context/parameters if enabled. Review the resulting subscriptions before deploying with those same contexts and the budget parameters. Do not subsequently run the default helper without those contexts and inadvertently remove receipt subscriptions. Test one verified consenting destination, then compare job/attempt/receipt states in the application. Unknown outcomes are not automatically retried; reconcile them first.

Browser push is not implemented. SNS SMS is not browser push. For a professor evaluation without approved SMS registration, demonstrate in-app notifications and real SNS/SQS events, and state the SMS boundary accurately.

## Optional SES operational email

Cognito identity emails and SNS alarm subscriptions are separate from incident emails. The incident worker can send SES email only after sender configuration and per-user opt-in. SES sender verification is not automated by this stack.

1. In **Amazon SES → Verified identities**, use the same region as deployment (`ap-south-1`) and verify an email address you control. Confirm SES account/sandbox status and service eligibility. Sandbox sending requires verified test recipient identities too. Review actual usage prices and stay within the approved budget.
2. Set the optional sender in your PowerShell session, preview and review the changed IAM/template:

```powershell
$env:AWS_EMAIL_FROM = 'your-verified-sender@example.com'
npm run cloud:plan
npx tsx scripts/verify-infra.ts cdk.out/academic/DisasterResponse-academic.template.json
```

3. Deploy using Step 5 with the same variable set. Keep it set for subsequent deployments. The template injects EMAIL_FROM and grants `ses:SendEmail` only to the worker for that exact email identity; it does not add a broad SES grant or deploy a verification resource.
4. In Administration enable **email notifications** for a consenting authority/rescuer whose profile email is an eligible recipient. Trigger a clearly labelled test report in that account's scope and inspect the notification job/attempt and recipient inbox.
5. Provider acceptance records **SUBMITTED**, not delivery. Definite failures can be retried within the three-attempt limit; ambiguous outcomes remain UNKNOWN for reconciliation. There is no SES bounce/delivery receipt consumer in this release. Do not interpret configured sender status as successful delivery.

For a locally running real-Cognito application, configure `EMAIL_FROM` in the private `.env.cognito` and give its SDK identity the equivalent narrow SES permission. Do not set real sender configuration in `.env.demo`: the application rejects it. The local demo worker uses a sink explicitly labelled SIMULATED and does not contact SNS/SES.

## 12. Final acceptance sequence

Use separate browser profiles and only test incidents/users. There are no pre-created authority/rescuer logins in a hosted deployment.

1. Verify citizen signup, email/TOTP, sign-in, recovery and logout; bootstrap/invite operational users as above.
2. Rescuer starts duty and location sharing inside the configured jurisdiction.
3. Citizen submits a test medical incident nearby and uploads supported evidence.
4. Authority acknowledges, finds qualified/available teams and offers an assignment.
5. Rescuer accepts; authority authorizes dispatch; responder progresses to completion.
6. Citizen sees authorized fresh/stale location, real route ETA where available, status updates and resolution.
7. Exercise no-team escalation, resource allocation/release, announcement update/withdrawal, metrics and account suspension.
8. Try cross-account incident/evidence access; it must be denied. Confirm session revocation and audit records.
9. Inspect queue/worker logs, exported analytics, alarms and budget settings. Record actual failures and results.

A successful deployment is not proof of emergency-service readiness. Independent security review, sustained load testing, operational training and verified recovery remain outside the completed academic validation.

## 13. Update and shut down without leaving hidden costs

For source updates, back up local configuration, inspect the Git changes and migration implications, then `git pull`, `npm ci`, run tests/build, preview and redeploy the same context variant. Publish the frontend again. Do not overwrite `.env.cognito` or rotate its session key accidentally. Never run the fixture seed against RDS.

When finished, **closing the browser, stopping VS Code, or stopping ECS does not stop all AWS billing**.

1. Export only the evaluation data you need and record `npm run cloud:inventory`.
2. Stop test activity, pipeline releases and schedules. Review the exact project resource IDs and retention settings.
3. In CloudFormation, delete only the reviewed `DisasterResponse-academic` stack when you are ready to remove it. The database, buckets, identity pool and other retained resources may survive stack deletion; do not interpret `DELETE_COMPLETE` as zero remaining costs.
4. For this project's retained RDS instance, decide whether a final snapshot is needed, then disable deletion protection and delete the instance through RDS. Snapshots themselves cost storage; delete retained test snapshots only after reviewing their contents and necessity.
5. Inventory this project's retained S3 buckets, all versions/delete markers, ECR images/repositories, Cognito pool, logs and secrets. Delete only reviewed project resources. Confirm NAT gateways/EIPs, ALB, tasks, VPC links, schedules and builds are gone. Review any failures rather than deleting shared networking blindly.
6. Review `CDKToolkit` separately: its S3/ECR artifacts and roles may be shared. Do not delete a shared bootstrap stack or GitHub connection.
7. Check Billing/credits again after reporting catches up. Verify no project compute/networking or retained billable storage remains. Consumed credits are not refunded by cleanup.

The legacy `scripts/cleanup.sh` targets the custom-domain `DisasterResponse-dev` stack, **not this academic stack**. Do not use it for this procedure.

## Alternative: local application with real Cognito accounts

Use this only if you want real login locally before the full deployment. It creates a separate retained identity pool; it does not provision RDS/ECS/maps/evidence. It still requires the account policy and CDK bootstrap prerequisites above. Do not deploy both stacks unintentionally.

```powershell
npx cdk synth ResponseAcademicIdentity --app 'npx tsx infra/identity.ts' --output cdk.out/identity --quiet
npx cdk deploy ResponseAcademicIdentity --app 'npx tsx infra/identity.ts' --output cdk.out/identity --outputs-file .local/identity-outputs.json --require-approval broadening
node scripts/configure-cognito.mjs .local/identity-outputs.json
npm run setup:local
npm run dev:local
```

Register/verify/enroll TOTP at `http://localhost:5173`, then in a second PowerShell terminal in the same project with the same authorized AWS profile:

```powershell
node --env-file=.env.cognito --import tsx scripts/bootstrap-admin.ts 'your-verified-email@example.com'
```

Sign in again, configure scopes/teams and invite users. Local setup uses `response_cognito` with reference data and no sample accounts; local durable jobs use the database. Credentials are read from the AWS CLI/SDK provider chain, not stored in `.env.cognito` by the helper. Stop with Ctrl+C and `docker compose stop db`; this preserves the volume. Delete the separate Cognito stack/retained pool only when no longer needed and after review.
