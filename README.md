# Cloud-Enabled Disaster Response and Management System

**Windows / VS Code handoff:** start with [START_HERE.md](START_HERE.md). It links the complete ZIP, local setup and [detailed PowerShell AWS instructions](docs/AWS_WINDOWS_DEPLOYMENT.md), including real accounts and every service integration.

**Response** is a TypeScript disaster-coordination application with citizen reporting, department/jurisdiction-scoped dispatch, responder duty and location sessions, durable escalation, and accountable incident histories.

This repository contains a working local workflow and AWS deployment definitions. **No AWS resources have been deployed.** Local demo identities are explicitly labeled and disabled in production. This is an academic coordination project, not a validated emergency-dispatch system. A submitted report does not guarantee acceptance by emergency services.

**Normal authentication uses Amazon Cognito.** Citizens register and verify their email; administrators provision operational accounts; MFA, recovery and persistent sessions use the real identity provider. Sample identities are an explicit test-only option and never available in a Cognito deployment.

**AWS deployment scope authorized on 25 October 2026:** a 24-hour window with a $30 credit allowance, $0 cash spend, no paid-plan upgrade and no domain purchase. AWS access and the budget email are configured; an explicit AWS Organizations policy deny currently blocks CloudFormation. No resources have been provisioned yet.

## AWS setup

Follow [the deployment guide](docs/ACADEMIC_DEMO.md) for the default-AWS-hostname stack, first administrator, operational invitations, frontend publication and cleanup. `npm run aws:preflight` performs read-only identity checks; `npm run cloud:plan` synthesizes the actual resource plan. The reviewed approval is recorded in `config/academic-deployment.json`; do not expand its scope or upgrade the account plan.

## Run locally with real accounts

Prerequisites: Node.js 22+, npm, Docker Desktop with Linux containers, and actual Cognito configuration. PowerShell, Command Prompt and Bash are supported.

```sh
npm ci
node scripts/configure-cognito.mjs .local/identity-outputs.json
npm run setup:local
npm run dev:local
```

The configuration helper requires outputs from the actual identity-only stack, creates ignored `.env.cognito`, and generates the session-encryption key without printing it. The isolated `response_cognito` database contains reference categories but no sample users. Use the documented verified-email/TOTP first-admin bootstrap, then invite authority and rescuer accounts through Administration. The frontend uses port 5173 and the API port 4000. Keep the startup terminal open.

For hosted deployment, settings and secrets are injected by AWS; the container starts the built API with Cognito enforced. The default AWS frontend address is only available after a successful deployment and frontend publication.

## Explicit local testing only

These commands deliberately use `.env.demo`, seeded sample identities and an isolated local workflow. They are not the normal login/setup commands:

```sh
npm run setup:demo
npm run dev:demo
```

Existing `.env` files from older versions are preserved and no longer select the normal authentication mode. Do not delete Docker volumes when updating source. Use `setup:local` for actual Cognito accounts or `setup:demo` only for controlled fixture testing.

## Demonstrate the complete workflow

1. Open three independent browser profiles for citizen, authority, and rescuer.
2. Rescuer: Teams & resources → Start duty → Share device location. Leave this tab open while handling assignments in another tab. The default demo team operates in the configured Mumbai demo area; physical GPS elsewhere correctly produces no eligible match. Browser automation uses explicitly simulated Mumbai coordinates.
3. Citizen: Need help → Medical emergency → coordinates near the team → Submit request.
4. Authority: Incident inbox → Acknowledge → Find eligible teams → Offer assignment.
5. Rescuer: Open the assigned incident in a second tab → Accepted.
6. Authority: Authorize dispatch.
7. Rescuer: En Route → Arrived → In Progress → Completed.
8. Citizen sees authorized tracking, changing status, and resolution. Without AWS routing configuration, **ETA unavailable** is the expected result.

GPS requires permission and a secure context. Local loopback is supported by modern browsers. Ending duty, leaving the sharing screen, logout, suspension, assignment completion, and session expiry stop or invalidate sharing. Stale coordinates are clearly labeled.

## Verify

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run infra:check
bash scripts/build-container.sh
npm audit --omit=dev --audit-level=high
```

`npm test` uses a separate database ending in `_test` and deliberately resets **that test schema only**. `setup:demo` creates it. Browser tests create labeled controlled incidents in the development database. They do not send SMS. Install Chromium with `npx playwright install chromium` (Windows/macOS) or `npx playwright install --with-deps chromium` (Linux) if no system Chromium is available. The normal unit/integration suite, setup/startup and browser tests do not require Bash. Use `docker build -t response-local:verified .` for a normal Windows Docker build. Only the optional legacy custom-domain shell helpers require Bash; the Windows AWS guide uses Node and PowerShell.

## Optional paid AWS reference deployment

Region defaults to **ap-south-1**. Read [deployment](docs/DEPLOYMENT.md), [cost assumptions](docs/COST_ESTIMATE.md), and [security](docs/SECURITY.md) first.

```sh
aws sts get-caller-identity --region ap-south-1
bash scripts/fetch-rds-ca.sh
npm run infra:synth -- --quiet
bash scripts/deploy.sh preview
# Only after explicit cost/resource approval and required settings:
bash scripts/deploy.sh deploy
```

The deploy script requires approved HTTPS domain configuration, an existing ACM certificate, a budget email, and an explicit approval variable. Preview does not deploy. CDK bootstrap, DNS changes, account registrations, and SMS enabling also require appropriate authorization. AWS identity is now verified; deployment is blocked by an explicit AWS Organizations policy deny on CloudFormation. See `docs/ACADEMIC_DEMO.md` for the current status.

## Layout

- `apps/web`: React/Vite interface, role-specific screens, MapLibre client.
- `apps/api`: Express API, Cognito/session integration, dispatch, worker, AWS adapters.
- `packages/core`: validation and lifecycle rules.
- `db/migrations`: versioned PostgreSQL/PostGIS schema and reference catalog.
- `infra`: AWS CDK stack with optional analytics and controlled pipeline.
- `tests`: unit, real PostGIS integration, and Playwright browser tests.
- `scripts`: setup, migrations, controlled admin bootstrap, deployment and cleanup.

See [implementation status](docs/IMPLEMENTATION_STATUS.md) for exact tested, unverified and incomplete capabilities; [API](docs/API.md), [architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md), [workflows](docs/USER_WORKFLOWS.md), [AWS services](docs/AWS_SERVICES.md), [testing](docs/TESTING.md), and [operations](docs/OPERATIONS.md) for details.
