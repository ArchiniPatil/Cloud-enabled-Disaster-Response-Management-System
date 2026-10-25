# Implementation status

Updated 25 October 2026. The repository was initially empty. **The core application is implemented and locally verified; no AWS resources have been provisioned and no public deployment URL exists.** Do not interpret local fixtures or SDK stubs as live AWS testing.

**Current user constraints:** academic demonstration with test users; $0 cash budget; no custom domain. User reports a Free plan with $120 credits and 169 days remaining. A concrete one-day credit-funded plan is in `ACADEMIC_DEMO.md`; the user has now instructed deployment within the reviewed 24-hour/$30-credit scope. Approval and administrator/budget email are recorded. Live STS and the Free Tier API now confirm access and an ACTIVE FREE plan with $120 credits, expiring 10 April 2027. An AWS Organizations SCP explicitly denies CloudFormation inventory, blocking deployment. The cash-funded reference stays blocked.

## Completed implementation

- [x] React/TypeScript mobile interface with citizen, authority, rescuer and administrator workspaces, loading/empty/error/offline states and explicit emergency-call fallback.
- [x] Citizen requests/reports, GPS capture with manual correction, severity/category validation, idempotent submission, personal history and cancellation.
- [x] Versioned PostgreSQL/PostGIS migrations, database catalog, spatial indexes, department/jurisdiction restrictions and separate organizations/teams/membership/capabilities.
- [x] Incident and assignment state machines, multiple assignments, capacity locks, acceptance distinct from dispatch, audited completion and guarded reopening.
- [x] Reopened incidents start a fresh escalation cycle; old completed dispatches do not satisfy new emergencies.
- [x] Durable deadlines, control-room notification persistence before matching, configurable radii/time stages, no-team outcomes, supervisor/manual review and restart-safe processing.
- [x] Transactional outbox, idempotent consumer, retry/backoff, SQS partial-batch handler and Lambda/Scheduler definitions.
- [x] On-duty location sessions, single active team source, authorized device updates, freshness/accuracy checks, retention, scope-checked reads and authenticated SSE.
- [x] Cognito code/PKCE/JWT/session implementation, encrypted server-side refresh tokens, CSRF, suspension/revocation, one-time verified-MFA admin bootstrap and invitation-only operational provisioning.
- [x] Administrative department/jurisdiction/category/policy/inventory/account-scope forms; privilege changes revoke existing sessions.
- [x] Inventory allocation/release limits and history; announcement audiences/expiry/revisions; private situation feed and possible-duplicate review.
- [x] AWS S3 private evidence adapter with bounded signed uploads, verified finalization outside the writable upload prefix and scoped downloads; AWS Location map and route adapter with explicit unavailable/stale behavior.
- [x] Real SNS SMS adapter with honest SUBMITTED/FAILED/UNKNOWN outcomes, bounded operator retries and disabled live sending by default.
- [x] CDK definitions for network, private ECS/RDS, HTTPS ALB, Cognito, S3, secrets, queues, worker/migrator Lambdas, Scheduler, monitoring, budget, Amplify and ECR. Optional controlled pipeline and aggregate analytics stack.
- [x] Separate migration/runtime database roles. Runtime DDL and audit-mutation denial are tested against PostgreSQL.
- [x] Node-based local setup and npm startup without a Bash dependency; missing-environment and Docker guidance. Verified on Linux; native Windows verification remains pending.
- [x] Docker image, CI verification, controlled deployment/cleanup scripts, database/operations/security/API documentation and OpenAPI contract.

## Validation evidence

| Check | Result | Scope |
|---|---|---|
| TypeScript, ESLint, production build | Passed | Local source and frontend/API bundles |
| Unit + integration suite | 41 tests passed | Real PostgreSQL/PostGIS plus explicitly stubbed AWS provider contracts |
| Playwright browser suite | 4 scenarios passed with SSE and polling | Citizen→authority→responder lifecycle, mobile persistence/GPS/layout, admin forms, organization/announcement/metrics workflows |
| Docker image build + smoke | Passed | Node 22 container, health/readiness, cookie identity, database-backed scoped request |
| CDK synthesis and security assertions | Passed | Local CloudFormation structure; no account API deployment |
| Pipeline + analytics variant synthesis | Passed | Optional resources included, not provisioned |
| Frozen installation and repeatable migrations/seed | Passed | Existing local checkout and persistent database |
| Production dependency audit | 0 known vulnerabilities reported | npm audit result at validation time; not a security certification |
| AWS STS identity | Passed, 25 October 2026 | Supplied runtime credentials authenticate `project-admin` after omitting the nonexistent workspace profile |
| AWS Free Tier account plan | Passed, 25 October 2026 | ACTIVE FREE; $120 credits; expiration 10 April 2027 |
| CloudFormation inventory | Blocked | Explicit deny of `cloudformation:ListStacks` by Organizations SCP `p-7hvdp5n3` |
| Live application integrations | Not run | Provisioning blocked by the organization policy |

See `TESTING.md` for commands and precise test boundaries. Test outcomes above describe executed checks, not a claim of emergency-service suitability.

## External prerequisites

- AWS identity, Free-plan account state and the scoped deployment authorization have been verified. The Organizations policy denies CloudFormation inventory and EC2 availability-zone lookup; an authorized administrator/AWS Support must resolve it before the user deploys. No custom domain is required for the academic stack.
- Current regional price/quota/service verification and explicit approval before provisioning. Current pricing/documentation requests were network-denied; planning cost ranges are unverified allowances.
- Live Cognito managed registration/MFA/recovery/refresh/revocation tests, RDS restore drill, S3 IAM/finalization tests, real queue/Lambda/Scheduler behavior and Location routes/maps.
- India/recipient-country SMS sender/template registration, verified test numbers, spend cap and approved IAM before SMS activation. No real SMS has been sent.
- Amplify frontend publication and same-origin cookie/polling proxy validation for the default-hostname stack (DNS/certificate configuration applies only to the separate custom-domain reference). Source code has been published to the authorized GitHub repository; this does not deploy the application.

## Added academic demonstration capabilities

- Separate Cognito login, citizen registration and password-recovery links; pending invitation resend; real-account local startup with an isolated unseeded database and controlled first-admin bootstrap.
- Organization activation, team membership display, capacity/vehicle/capability editing with qualification expiry and active-assignment guards; notification preferences and attempt/retry UI.
- Announcement correction and withdrawal; bounded authorized response-time, escalation, team and inventory metrics.
- Authenticated address search and map-pin correction; administrator-published shelter/resource locations with private-by-default scope rules.
- Idempotent SNS delivery-receipt ingestion through optional allowlisted CloudWatch subscriptions; no phone/raw provider payload persistence.
- Encrypted incident, team and resource aggregate exports and three Glue/Athena tables.
- Domain-free academic AWS template: Amplify default hostname, API Gateway HTTPS, VPC Link to an internal ALB, private ECS/RDS; tested authenticated polling as an alternative to SSE.
- Identity-only CDK template and PowerShell-compatible setup/preflight/deployment helpers; no AWS account upgrade or automatic provisioning.

## Remaining external acceptance and operational limits

- SMS receipt ingestion is implemented and locally tested; live SNS logging/subscriptions, sandbox destinations and sender/template registration remain unconfigured. Browser push is optional and not implemented; in-app notices and authorized SSE/polling are available.
- Analytics exports and operational metrics are implemented. Live S3 exports and Athena queries remain unverified; no external BI dashboard is configured.
- Real Cognito enrollment/invitations/MFA/recovery, email delivery, S3 uploads, Location map/search/routes and hosted proxy/cookie behavior require actual provider configuration and live acceptance tests. A provider identity created immediately before a database failure requires operator reconciliation; no cross-service transaction is claimed.
- No independent penetration testing, sustained load/chaos testing, verified AWS disaster recovery, malware/EXIF scanning, legal retention review or operational field validation.
- CDK synthesis cannot prove account-specific IAM, quotas, regional data-provider support, successful migrations on RDS, or cloud transport behavior. These remain explicit deployment acceptance gates.

## Reusable development environment

The environment draft contains tested `install_script` and `start_skill` instructions, preserving the existing checkout, $0 AWS policy and no-domain evaluation path. Saving this draft is confirmed; publication is confirmed and runtime AWS variables are available; validation in a fresh restored task has not been performed. Current API/frontend/worker startup and the database heartbeat were verified.

## Real-account default (25 October 2026)

Normal `setup:local` / `dev:local` now require actual Cognito configuration and an unseeded real-account database. Fixture accounts are only available through explicit `setup:demo` / `dev:demo` commands using `.env.demo`; existing legacy `.env` files are not silently reused. `.env.example` is Cognito-based. AWS deployment approval is recorded for the previously reviewed scope. AWS operator authentication and Free Tier account checks now pass; application authentication remains untested. CloudFormation inventory is blocked by organization policy, so no deployment has occurred.


## VS Code handoff

The user elected to deploy personally. `START_HERE.md` and `AWS_WINDOWS_DEPLOYMENT.md` provide the complete Windows handoff, with VS Code tasks, a PowerShell frontend publisher, optional pipeline configuration and service-by-service acceptance. The normal test suite now uses a portable Node deployment-policy guard. A CloudWatch metric-log reference was corrected and asserted in synthesis. The build and 41 local tests pass; no native Windows or live AWS integration success is claimed.

`cloud:plan` is now an offline environment-agnostic preview so account lookup restrictions do not prevent source review. Deployment performs real account-specific resolution and remains blocked by the SCP. The optional pipeline still needs an authorized GitHub connection and deploys only the backend. SMS is disabled; country-specific registered sender/entity/template attributes still require adapter configuration before activation. Incident aggregate exports do not currently include geographic grouping. See the handoff guide for these boundaries and the corresponding external work.
