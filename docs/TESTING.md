# Test commands and actual results

## Latest operational redesign verification

Executed locally on Linux with Node 24, PostgreSQL 16/PostGIS 3.5 and Chromium; the container uses Node 22. No live provider acceptance or native Windows run is claimed.

| Check | Actual result |
|---|---|
| `npm run setup:demo` | Passed: locked dependency install, preserved Docker volume, migrations through 007, repeatable fixture seed |
| `npm run lint` | Passed |
| `npm test` | **47 passed**, 2 files, none skipped |
| `npm run test:e2e` | **7 passed** with SSE; **7 passed** with `REALTIME_TRANSPORT=poll` |
| `npm run build` (includes TypeScript) | Passed; lazy MapLibre chunk size warning remains |
| `npm run cloud:plan` + `npx tsx scripts/verify-infra.ts cdk.out/academic/DisasterResponse-academic.template.json` | Passed: offline default academic template/security checks |
| Optional SES/pipeline/analytics offline synthesis | Passed with synthetic configuration; one `ses:SendEmail` grant, worker only, exact sender identity; pipeline present |
| `DOCKER_CONFIG="$PWD/.local/docker-config" bash scripts/build-container.sh` | Passed with TLS verification intact; production install reported 0 vulnerabilities |
| New container with explicit nonproduction fixture config + `SMOKE_API_ORIGIN=http://127.0.0.1:4001 npm run smoke:local` | Passed DB readiness, cookie sign-in, scoped list and logout; temporary container removed |
| Native Windows and live Cognito/SES/SMS/S3/Location/hosted acceptance | Not run |

New coverage verifies loopback-origin boundaries, missing fixture guidance, scoped aggregates beyond 30 rows, literal search/priority/filtering, hazard fields, immutable/idempotent supplements, closed-report rejection, outcome requirements, current-cycle acceptance pause, decline/access revocation and recipient-specific notification links. A simulator test drains bounded batches while asserting **zero SNS/SES sends**. A stubbed SES acceptance test verifies SUBMITTED rather than DELIVERED.

The seven browser cases cover the citizen→authority→rescuer lifecycle and outcomes; mobile session/GPS/layout; admin scopes; organization/announcement/metrics workflows; separate development login and failed session refresh; queue filters/report hazards/supplements/empty map; and revoked sessions/unconfigured Cognito. Browser geolocation is controlled test data. Screenshots under ignored `test-results/` contain local fixture data, not actual emergencies.

The first expanded browser run found three failures: shared-IP API throttling affected multi-role sessions, and a filter lacked an unambiguous accessible label. The implementation now limits authenticated API traffic per user, retains separate IP-based auth limits, and explicitly labels filters. The full suites passed after correction; no failing tests were deleted or skipped. Earlier compile/lint issues and the bounded simulator-test backlog were also resolved and rerun.

Run the same checks from [START_HERE.md](../START_HERE.md). Stop an existing development server before browser testing so Playwright starts the intended isolated configuration. The standard test database must end in `_test`; browser tests write labelled fixtures to the development database. Never use an operational database.

## Historical verification record

The sections below describe earlier releases, including their then-current counts and startup behaviour. The latest results and explicit `setup:demo` / `dev:demo` commands above supersede them.


Validation performed locally on 24 October 2026, using Node 24 on the host, Node 22 in the container, PostgreSQL 16 / PostGIS 3.5, and Chromium. No live AWS services were provisioned or used for acceptance testing.

| Command / check | Actual outcome |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` / `npm run build` | Passed; MapLibre's lazy-loaded map bundle has a size warning |
| `npm test` | **41 passed**, 2 files; no skipped tests |
| `npm run test:e2e` | **4 passed** with SSE and polling; no skipped scenarios |
| `npm run infra:check` | Synthesis plus private-network/encryption/MFA/queue/scheduler/budget/secret-output assertions passed |
| `npm run infra:synth -- -c analytics=true -c pipeline=true --quiet` | Passed; optional resources defined only |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities reported |
| `npm run setup:local` | Node-based setup: frozen reinstall, existing volume startup, repeatable migrations/seed passed on Linux |
| `bash scripts/build-container.sh` | Image built with TLS verification intact using the managed proxy/CA |
| `npm run dev:local` + `npm run smoke:local` | Passed from the saved local launcher; API, Vite and worker running |
| Container HTTP smoke | Liveness, DB readiness, cookie sign-in/profile and scoped incident list passed |
| `aws sts get-caller-identity --region ap-south-1` | Failed: configured environment identity profile unavailable |
| Live Cognito/S3/SMS/SQS/RDS/Location/Amplify checks | **Not run**; account/configuration/provisioning prerequisites remain |

## Isolation and safety

`npm test` requires a database name ending in `_test`. It resets only that schema. `npm run setup:demo` creates `response_test`; `TEST_DATABASE_URL` can select another explicitly named test database. Never point it at operational data. Unit/integration tests run sequentially because the integration file exercises a full workflow and carefully restores SDK/configuration stubs.

The default browser tests use the separate development database and clearly labeled demo accounts, create controlled incidents and administrative fixtures, and exercise mocked browser geolocation. They never claim physical GPS validation or real SMS delivery. Browser screenshots/traces are generated under ignored `test-results/`.

## Coverage that can fail

- A $0-budget deployment guard refuses paid provisioning before accessing credentials or AWS, even with a stale approval flag.
- Strict report validation and role injection rejection; illegal incident/assignment transitions; critical escalation and stale-location/ETA presentation.
- Locally signed Cognito-shaped JWT verification: signature/key, issuer, token use, client and expiry. **This is not a live Cognito sign-in/refresh test.**
- Real database persistence, SRID/spatial radius, department/jurisdiction scope, unrelated-citizen denial, on-duty/qualification eligibility and capacity-lock concurrency.
- Immediate control-room record creation, duplicate reports/events, persisted no-team escalation, a separate worker process recovering deadlines, and reopened-incident response cycles.
- Responder acceptance distinct from authority dispatch; en-route/arrival/completion; authorized tracking, stale GPS and tracking cessation.
- Append-only history/audit triggers and production-style runtime-role denial of DDL/audit/schema-ledger mutation.
- Resource over-allocation, authority-only notices, sensitive publication denial, suspension, permission-change session revocation, logout location stop, pagination validation, and DB-failure readiness.
- SDK-stubbed SNS acceptance/ambiguous failure and duplicate suppression; failed outbox publication/recovery; S3 verified-version finalization outside the writable upload prefix. No external call is represented as a provider integration pass.
- Local Lambda event handler partial-batch failure and duplicate records.
- Browser scenario: citizen report → authority acknowledgement/offer → rescue acceptance → authority dispatch → active tracking → en route/arrival/in progress/completed → citizen resolved view → logout.
- Browser mobile scenario: persistent cookie session, automatic GPS capture, manual location inputs and no horizontal overflow.
- Browser admin scenario: protected department and jurisdiction forms, configuration outcomes and notification-status visibility.

## Investigated failures corrected

Initial checks caught a type/import mismatch, a test-runner API change, a sign-in rate limit incorrectly counting ordinary session/config requests, a CloudFormation migration dependency cycle, and reopened incidents incorrectly treating previous dispatch as a current response. A final launch check also caught a changed dependency CLI path and environment-file propagation issue; the explicit `dev-local.mjs` launcher now forwards the loaded environment and passes a sign-in/database/logout smoke check. Each affected check was rerun after correction.

Docker initially lacked the managed proxy DNS mapping and CA trust context. `build-container.sh` supplies the existing proxy hostname mapping and mounts the CA only at build time; npm signatures/integrity and TLS checks stay enabled. The proxy certificate and credentials are not copied into image layers. Plain `docker build` remains appropriate in an ordinary network; the helper supports this managed environment.

## Windows local setup correction

The reported Windows failure occurred before installation: PowerShell resolved `bash` to an unavailable WSL shell. `setup:local` now runs a Node script with no shell-specific environment assignments. It checks Docker, installs dependencies into the existing checkout, preserves an existing `.env`, creates it when absent, and prepares the demo and test databases. The development launcher invokes npm through Node without shell quoting and provides a useful message when `.env` is missing. Playwright passes `AUTH_MODE` through its environment configuration instead of POSIX command syntax.

For this correction, setup, lint, typechecking, development startup, the database/session smoke check, and all three browser scenarios (including automatic server startup) passed on Linux. A missing-environment check from a directory containing spaces also passed. Native Windows execution remains unverified in this environment. At that point the paid-deployment guard test still used Bash; the Windows handoff below replaces it with a shared Node guard.

## Remaining acceptance gates

After approved AWS provisioning, run a real-identity and real-provider version of the workflow: Cognito enrollment/session renewal/revocation, least-privilege S3 and DB access, provider route results, bounded queue retries and DLQ recovery, validated SMS sandbox receipt handling, deployed SSE/cookies, alarm notification and RDS restore. Validate rate limits/load, timezone and jurisdiction edge cases, accessibility, malicious evidence handling, and operational policies before any real emergency use.

## Academic expansion checks

The new tests exercise PKCE login/registration/recovery redirects without contacting Cognito, organization deactivation and qualification expiry, scoped metrics, announcement revision/withdrawal, duplicate/out-of-order SMS receipts, encrypted three-dataset analytics exports using an S3 stub, private/public resource locations, bounded address search using a Location stub, and the unapproved academic-deployment guard. No test result represents live Cognito, SNS, S3 or Location acceptance.

The test database now runs the actual ordered migration runner, including management/receipt and resource-location migrations. An added analytics test exposed a reserved SQL alias in the previous export path; it was corrected and the test rerun. The initial integration run encountered a stopped local database; Docker was started before rerunning successfully.

Native Windows remains unverified here. The Windows handoff removes the test suite's Bash dependency; the optional legacy custom-domain deploy/cleanup scripts still use Bash. The academic template's internal ALB/HTTPS gateway, database privacy, MFA and no-secret-output checks are local template assertions, not a deployed networking test.

Release verification on 25 October 2026: the updated Node 22 container built successfully and passed database readiness, cookie sign-in, scoped incident listing and logout. The first smoke request arrived before container startup completed; it passed after the startup event. The managed build used a writable ignored Docker configuration directory because the default home directory was read-only. No application TLS checks were disabled.

The identity-only template, default-hostname academic template and custom-domain reference all synthesized successfully. The optional pipeline/analytics/SMS-receipt-subscription variant also synthesized, using a clearly synthetic account ID solely for the template test. The academic template includes three Glue tables; local security assertions passed for private database/tasks, internal ALB/VPC Link, MFA, redrive, scheduler, migrations, budget and secret-free outputs. These remain undeployed definitions.

Default-authentication checks now verify that normal startup cannot enter fixture mode. The deployment-guard test uses an explicitly unapproved temporary configuration, so the real deployment authorization never causes tests to invoke AWS. Local fixture setup/startup commands are now `setup:demo` / `dev:demo`; normal startup uses Cognito.


## Live account preflight — 25 October 2026

- Published runtime AWS credentials authenticated `project-admin` through STS. The initial call failed because the workspace still selected a nonexistent profile; omitting `AWS_PROFILE` and `AWS_DEFAULT_PROFILE` for that command allowed the explicitly supplied credentials to work.
- `aws freetier get-account-plan-state --region us-east-1` confirmed ACTIVE FREE, $120 credits, and expiry on 10 April 2027.
- `aws cloudformation list-stacks --region ap-south-1` failed with an explicit deny of `cloudformation:ListStacks` by Organizations SCP `p-7hvdp5n3`. Deployment did not proceed. IAM grants alone cannot override this restriction.
- The installed CLI rejects `--no-cli-pager`; read-only checks were rerun without that option. Cloud deployment requires a compatible AWS CLI before using the existing helper.
- No resources were provisioned, no account plan was changed, and no application/provider acceptance tests were claimed. No credentials were printed or committed.


## VS Code / Windows source handoff — 25 October 2026

- Added root `START_HERE.md`, VS Code tasks, and `docs/AWS_WINDOWS_DEPLOYMENT.md` covering installation, real Cognito accounts, every service, full hosted deployment, frontend upload, first administrator/invitations, optional pipeline, live acceptance and cleanup.
- Replaced the Bash-dependent paid-policy unit test with a Node policy guard shared by the legacy deploy script. The full suite passed: **41 tests, 2 files** on Linux. Native Windows execution is still pending on the user's computer.
- ESLint, TypeScript and production build passed. The existing MapLibre bundle-size warning remains. No application/UI changes require a new browser acceptance claim; the prior four SSE/polling browser scenarios remain the recorded browser evidence.
- Corrected CloudWatch's notification metric filter to reference the worker's configured log group. Added a synthesis assertion comparing the filter and Lambda log-group references; academic synthesis and assertions passed, both with and without the optional pipeline. The pipeline preview used a synthetic connection ARN solely for synthesis and included one CodeBuild project, one CodePipeline and three Glue tables; no connection or resource was created.
- An initial account-bound preview was denied on `ec2:DescribeAvailabilityZones` by the same Organizations SCP. `cloud:plan` now explicitly synthesizes an environment-agnostic preview with lookups disabled; actual deployment still resolves the real account/region/AZs and requires permissions. The offline preview passed; it is not evidence that AWS permitted deployment.
- AWS helpers disable the pager through `AWS_PAGER` rather than a CLI-version-specific flag and expose the actual preflight failure reason. The new frontend PowerShell helper verifies local outputs against the live stack, keeps signed upload URLs in memory and checks publication/readiness. Its live execution and native PowerShell behavior have not been tested in this Linux environment.
- Added a portable official RDS CA download/parse helper; syntax checked, with no CA refresh/network download claimed. Optional CodeBuild now includes the production dependency audit.
- No cloud resources, emails, invitations, SMS or deployments were created during this source handoff.
