# Application redesign and completion report

The existing application has been upgraded in place. Local database-backed workflows are verified. **AWS has not been deployed or live-validated.** This source release is ready to open in VS Code and run locally; it is not a certified emergency dispatch service. Read [START_HERE](../START_HERE.md) first and [the Windows AWS guide](AWS_WINDOWS_DEPLOYMENT.md) when deploying.

## 1. Interface changes

The application now uses navy navigation, readable typography, consistent spacing, severity colours, responsive forms, visible keyboard focus and reduced-motion support. The main entry offers ordinary Cognito sign-in/registration/recovery, with an explicit unavailable explanation when identity is not configured. Local fixture access is on a separate **Development / Demo Mode** screen.

Each role has its own dashboard. The authority workspace includes backend counts, critical/unassigned/overdue attention indicators, priority queue, search, filters, paging, recent activity and a synchronized map. Citizen and responder views focus on reports and assignments respectively. Administrators see integration configuration, worker heartbeat and backlog. Missing maps and empty queues have explicit states; no invented metrics or responder positions are displayed.

## 2. Working and locally verified features

- Cookie sign-in/logout for explicitly enabled local fixtures, role routes, backend authorization, session revocation, CSRF and helpful authentication errors.
- Citizen reporting with GPS/manual coordinates, reported uncertainty, estimated people affected and hazards; idempotent persistence, private report tracking, append-only supplementary information and policy-controlled cancellation.
- Scoped queue filtering by category, severity, status, department, time and active/unassigned/overdue view; literal ID/address search, priority ordering, accurate aggregate counts beyond the first page and periodic refresh.
- Authority acknowledgement, qualified-team offers, responder acceptance, separate dispatch authorization, progress/arrival, required decline/cancellation/completion notes, outcome history and resolution. Transactions protect team capacity and inventory.
- Department/jurisdiction/qualification/duty/location/capacity matching, conservative incident-uncertainty handling, configurable escalation stages and durable review history. Current-cycle acceptance pauses automatic expansion; an authorized forced review can override that pause. Critical authority acknowledgement alone does not imply team acceptance.
- Organization/team/category/policy/resource/account-scope administration, announcements, scoped metrics, audit review and sensitive-action safeguards.
- In-app notifications and a local SMS/email sink labelled **SIMULATED**. No external messages are sent in fixture mode. Notification attempts, failures, timestamps and read state are visible. Restricted responder notices do not grant incident-detail access.
- Database initialization/migrations, build, tests, Docker image and offline infrastructure synthesis. Exact validation scope is in [TESTING.md](TESTING.md).

## 3. Partial or unconfigured integrations

| Capability | Implemented | Still required |
|---|---|---|
| Cognito | PKCE, verified JWTs, encrypted refresh tokens, cookie sessions, citizen signup, invitations, recovery, MFA bootstrap | Deployed pool/client/domain, real enrollment and hosted-session acceptance |
| S3 evidence | Scoped signed upload/download, byte/size validation and finalized object copy | Bucket/IAM deployment and real upload/download checks; malware/EXIF scanning is not implemented |
| Location | Signed maps, address search, map pin, routes, scoped fresh responder snapshots | Location resources/roles and real map/search/route verification |
| SNS SMS | Bounded sender, retries and receipt reconciliation | Country registration/templates, sandbox numbers, opt-in, spend approval and direct-SMS IAM; disabled by default |
| SES email | Opt-in worker adapter, bounded retries, provider acceptance tracking, optional narrow IAM | Verified sender/recipient eligibility, regional SES access and live test; no email delivery-receipt ingestion |
| Hosted system | CDK infrastructure, migration/worker, frontend publication and cleanup instructions | Deployment, live service acceptance and account-policy resolution |
| Analytics/pipeline | Aggregate export/catalog and optional controlled pipeline | Actual queries, source connection and build/deploy acceptance |

A successful provider submission is **SUBMITTED**, not DELIVERED. Only a supported real SMS receipt can report delivery. Configured credentials/resource names are not proof of provider connectivity. Browser push is not implemented.

## 4. Broken local login: causes and fixes

The reported PowerShell failure happened before setup: an old npm command invoked missing WSL Bash, so dependencies, environment configuration and seed users were absent. Setup/start now use Node scripts; fixture mode has explicit commands and its own environment file.

The source audit also found an exact-origin mismatch when opening `127.0.0.1` while `APP_ORIGIN` used `localhost`. Nonproduction fixture mode now accepts these loopback aliases only with the configured scheme/port. Production origin checks remain exact. Missing fixture users return setup guidance. The client no longer swallows a failed post-login session refresh and handles protected-API 401 responses by clearing the session with an explanation.

Browser testing exposed a shared-IP API rate limit that could block multiple role sessions. Protected API requests are now limited per authenticated user; separate IP limits remain on authentication reads and mutations. Accessible filter labels and visible login errors were also verified. This was not a missing universal password: local fixtures have none, and real passwords belong to Cognito.

## 5. Exact local startup commands (PowerShell or a normal terminal)

Install Node 22+, VS Code and Docker Desktop with Linux containers. Start Docker. Extract the project and open the folder containing `package.json` in VS Code. In its terminal:

```powershell
npm run setup:demo
npm run dev:demo
```

Open **http://localhost:5173** and keep that terminal running. Setup installs the locked dependencies itself. If PowerShell blocks `npm.ps1`, use `npm.cmd` instead. Stop with Ctrl+C. `docker compose stop db` stops the database while preserving it. Do not use `docker compose down -v` to solve a startup problem.

For normal Cognito authentication, follow the identity-only deployment instructions in the [Windows AWS guide](AWS_WINDOWS_DEPLOYMENT.md#alternative-local-application-with-real-cognito-accounts), then:

```powershell
node scripts/configure-cognito.mjs .local/identity-outputs.json
npm run setup:local
npm run dev:local
```

The outputs file must come from an actual successful identity deployment. Normal startup never silently selects development identities. Stop the old server before switching modes.

## 6. Database setup and seed

`setup:demo` starts PostgreSQL 16/PostGIS 3.5, applies migrations through **007**, creates the isolated `response_test` database and idempotently seeds development users, jurisdictions, teams and reference data in `response`. It preserves existing volumes and configuration. It does not create fictional emergency incidents or GPS positions; report labelled test incidents yourself. Migration 007 adds hazards/people/accuracy, immutable supplements, assignment outcome notes, email preferences and explicit simulated notifications.

For an explicit reseed after setup:

```powershell
node --env-file=.env.demo --import tsx scripts/seed.ts
```

Real-account local setup uses `response_cognito`, reference catalog data and no fixture users. Never seed an operational database or run tests against it. `npm test` resets only a database whose name ends in `_test`.

## 7. Login and registration for each role

| Role | Local fixture access | Real account access |
|---|---|---|
| Citizen | Entry → Open Development / Demo Mode → Citizen → Continue with local account | Register through Cognito, verify email and enroll MFA; public registration grants CITIZEN only |
| Authority | Same local page, choose Authority | Administrator invites a department/jurisdiction-scoped authority |
| Rescuer | Same local page, choose Rescuer | Administrator creates team/scope and invites a team member |
| Administrator | Same local page, choose Administrator | Register and verify intended account first, then use controlled one-time bootstrap |

There are no shared passwords and no public admin registration. Password fields, recovery and provider-specific visibility controls remain on Cognito's managed page; they are not imitated in an application password form. For a real local first administrator, after verification/TOTP and initial sign-in:

```powershell
node --env-file=.env.cognito --import tsx scripts/bootstrap-admin.ts 'your-verified-email@example.com'
```

Sign out and back in after promotion. The command refuses once an administrator already exists. Hosted bootstrap uses the private migration function procedure in the AWS guide. Use separate browser profiles for simultaneous roles. A rescuer must start duty and authorized location sharing before eligibility; local fixtures cover a Mumbai jurisdiction, so real coordinates outside it will correctly fail matching. Browser tests use explicitly mocked coordinates; the application does not fake GPS.

## 8. Executed tests and results

- **47/47** unit/database integration tests passed; none skipped.
- **7/7** browser scenarios passed with SSE and **7/7** with polling. They cover all roles, full incident lifecycle, mobile layout, queue filters, hazards/supplements, empty/map-unavailable states, login service errors and revoked sessions.
- ESLint, TypeScript and production build passed. The lazy MapLibre chunk retains a bundle-size warning.
- Frozen dependency setup and migration/seed passed on Linux. Docker image build and offline infrastructure checks are recorded in [TESTING.md](TESTING.md).
- Default academic infrastructure and optional SES/pipeline variant synthesized; security assertions passed. This is template validation, not deployment.

Native Windows, live Cognito, live SES/SMS, live map rendering, actual S3 transfers and hosted AWS acceptance have **not** been executed. Provider unit/integration tests use explicit stubs; browser GPS is mocked.

## 9. AWS resources and credentials still required

Use the detailed [Windows deployment guide](AWS_WINDOWS_DEPLOYMENT.md), which includes preflight, cost review, CDK bootstrap/deployment, frontend publication, first-admin setup, per-service acceptance, optional pipeline/analytics and teardown. Securely configure AWS CLI/SSO credentials locally; never paste keys into chat or source. Deployment needs an authorized identity and sufficient CloudFormation/IAM/ECR/compute/database/network/service permissions, constrained by organization policy.

The chosen architecture uses Amplify, API Gateway/VPC Link/internal ALB, private ECS Fargate and RDS/PostGIS, Cognito, S3, SNS/SQS, Lambda/Scheduler, Location, Secrets Manager, CloudWatch/Budgets and aggregate S3/Glue/Athena. Pipeline and SES are optional. SES sender verification is external to this stack. No custom domain is required for the academic path.

Earlier read-only checks authenticated the supplied AWS identity, but an **Organizations SCP explicitly denied CloudFormation inventory and EC2 availability-zone lookup**. An authorized organization administrator or AWS Support must resolve that restriction. Deploying from your laptop does not bypass it. Credits are not a hard spending cap; confirm current eligibility, pricing, remaining credits and cleanup before deployment. Logging out does not stop billing. No new AWS resources or external notifications were created by this redesign.

## 10. Security and operational limits

Backend scope checks, CSRF, parameterized SQL, transaction locks, idempotency, append-only records, tracking privacy and TLS verification remain in place. The local simulator is rejected in production. Private hosted HTTP hops, retained AWS resources and deletion responsibilities are documented in the deployment guide.

This release has not had independent penetration testing, sustained load/chaos testing, full accessibility certification, jurisdiction-specific privacy/retention review, verified cloud restore or field validation. GPS depends on permission, freshness and a live browser tab. Polling/worker schedules are not guaranteed emergency response times. Account creation across Cognito and PostgreSQL is not a cross-service transaction and may require reconciliation after a partial failure. Use official emergency services for immediate danger; neither submitting a report nor changing a status proves that help was dispatched or a real incident was resolved.
