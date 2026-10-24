# Cloud-Enabled Disaster Response and Management System

**Response** is a TypeScript disaster-coordination application with citizen reporting, department/jurisdiction-scoped dispatch, responder duty and location sessions, durable escalation, and accountable incident histories.

This repository contains a working local workflow and AWS deployment definitions. **No AWS resources have been deployed.** Local demo identities are explicitly labeled and disabled in production. This is an academic coordination project, not a validated emergency-dispatch system. A submitted report does not guarantee acceptance by emergency services.

**Current evaluation policy: $0 AWS budget, no custom domain.** The local workflow below creates no AWS resources. Paid deployment is blocked by `config/deployment-policy.json`; the CDK stack is a paid reference architecture, not a Free Tier guarantee.

## Run locally

Prerequisites: Node.js 22+, npm, and Docker with Compose. On Windows, start Docker Desktop with Linux containers and use PowerShell, Command Prompt, or Git Bash. The local setup and startup commands do not require Bash or a WSL shell. Extract the project ZIP and open a terminal inside the extracted project folder first. The environment was verified with Node 24 and PostgreSQL 16/PostGIS 3.5.

```sh
npm run setup:local
npm run dev:local
```

Wait for setup to print **Local setup complete** before starting the app. Keep the development terminal open while using the application. If setup fails, fix that error and rerun it before attempting startup or tests; setup installs the missing tools and creates `.env`.

The frontend listens on port **5173**, API on **4000**, and loopback-only PostGIS on **5432**. Use the clearly marked Demo Citizen, Authority, Rescuer, and Admin buttons. The local database password in `.env.example` is a disposable Docker development credential, never an AWS credential. Never expose this local configuration publicly.

The startup command loads the ignored `.env`. For production, set `AUTH_MODE=cognito` and provide the CDK environment configuration. No production password is stored in PostgreSQL application tables.

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

`npm test` uses a separate database ending in `_test` and deliberately resets **that test schema only**. `setup:local` creates it. Browser tests create labeled controlled incidents in the development database. They do not send SMS. Install Chromium with `npx playwright install chromium` (Windows/macOS) or `npx playwright install --with-deps chromium` (Linux) if no system Chromium is available. The paid-deployment guard test in `npm test` and the optional container/cloud helper scripts still require Bash; on Windows, run that suite from Git Bash with Git for Windows on PATH. Bash is not needed to set up or run the app, the smoke check, or the browser tests.

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

The deploy script requires approved HTTPS domain configuration, an existing ACM certificate, a budget email, and an explicit approval variable. Preview does not deploy. CDK bootstrap, DNS changes, account registrations, and SMS enabling also require appropriate authorization. The environment currently lacks usable AWS identity.

## Layout

- `apps/web`: React/Vite interface, role-specific screens, MapLibre client.
- `apps/api`: Express API, Cognito/session integration, dispatch, worker, AWS adapters.
- `packages/core`: validation and lifecycle rules.
- `db/migrations`: versioned PostgreSQL/PostGIS schema and reference catalog.
- `infra`: AWS CDK stack with optional analytics and controlled pipeline.
- `tests`: unit, real PostGIS integration, and Playwright browser tests.
- `scripts`: setup, migrations, controlled admin bootstrap, deployment and cleanup.

See [implementation status](docs/IMPLEMENTATION_STATUS.md) for exact tested, unverified and incomplete capabilities; [API](docs/API.md), [architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md), [workflows](docs/USER_WORKFLOWS.md), [AWS services](docs/AWS_SERVICES.md), [testing](docs/TESTING.md), and [operations](docs/OPERATIONS.md) for details.
