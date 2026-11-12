# Response — release candidate 2026.11.10-rc2

Prepared and verified 10 November 2026; published 12 November 2026. Complete preserved Tasks 1–4 source plus independent Fire demo identities/team/jurisdiction, scope guidance, regressions and updated AWS hosting plan. RC1 and main are unchanged. This separate artifact branch contains the verified ZIP; cloning main does not retrieve this release.

- [Download the complete project](https://raw.githubusercontent.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/downloads/response-2026-11-10-rc2/Response-2026.11.10-rc2.zip)
- [ZIP file page](https://github.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/blob/downloads/response-2026-11-10-rc2/Response-2026.11.10-rc2.zip)
- [Exact fresh-extraction commands/results](Response-2026.11.10-rc2.verification.json)
- [Every packaged file and public-copy differences](Response-2026.11.10-rc2.manifest.json)
- [Checksum](Response-2026.11.10-rc2.sha256)

Size: **856,638 bytes**, **153 project files**, one `Response/` root.

SHA-256:

```text
2bb79b61b04d70e20f46382f9cdaa45bf7e82d99263023dd2d65f0bf936cae07
```

## Exact archive verification

This ZIP was extracted into a completely fresh directory. Each packaged hash, the root manifests and eight migrations were verified before a clean locked dependency installation. Environment: Linux x86_64, Node 24.19.0/npm 11.9.0, PostgreSQL 16/PostGIS 3.5, Chromium. Tests used separate disposable local `_test` databases; ordinary project data was not reset.

| Check | Actual result |
|---|---|
| Clean install / dependency tree | PASS: `npm ci --no-audit --no-fund`, `npm ls --all`; unchanged lockfile |
| Focused security/configuration/readiness/workflow/Fire regressions | PASS: 229/229, seven files, no skips |
| Full suite | PASS: 282/282, nine files, no skips |
| Browser suite | PASS: 22/22, Medical and Fire journeys plus navigation/GPS/error scenarios |
| Documented local setup/start/smoke | PASS: `npm run setup:demo`, `npm run dev:demo`, `npm run smoke:local`; Fire logins through Vite; separate disposable database |
| TypeScript | PASS: `npm run typecheck` |
| Lint | PASS: `npm run lint` |
| Frontend/API/worker/Lambda/migrator builds | PASS: `npm run build` |
| Public RDS trust helper | PASS: verified HTTPS and X.509 parsing; `NODE_USE_ENV_PROXY=1` for this managed environment |
| Offline infrastructure | PASS: academic, reference and optional receipt variants; three syntheses plus assertions |
| Archive privacy/content review | PASS: source/tests/docs/templates only; no actual env files, credentials, certificates/private keys, local data, dependencies, generated outputs or account-specific deployment authorization |

Exact commands, durations and environment overrides are in the adjacent verification JSON. Synthetic local fixture connection values and the synthetic offline account are public test inputs, not production credentials. No failing check was deleted, skipped or weakened.

Pre-packaging workspace checks also passed: the same regression/full/browser counts; Node 22 nonroot Docker rebuild; compiled repeat migrations; API readiness/liveness failure and recovery; worker persisted-deadline recovery after restart; transactional incident closure; API restart/graceful shutdown and local cookie smoke. The actual academic planning helper (including analytics) and optional identity template synthesized offline. These are local results, not native Windows or AWS evidence. Read `docs/FINAL_MASTER_REVIEW.md` for commands and the initial test-harness failure/correction history.

## Start locally

Preserve your old project, configuration and database volume. Extract into a new short path and open the inner `Response` folder in VS Code. Use Node 24 LTS (Vite requires at least Node 22.12), and start Docker Desktop with Linux containers:

```powershell
npm ci --cache .local/npm-cache
npm run setup:demo
npm run dev:demo
```

Open http://localhost:5173 → Open Development / Demo Mode. Six selectable identities cover Citizen, Medical Authority, Medic responder, Fire Authority, Fire responder and Admin. Existing Medical accounts and records remain. Follow `LOCAL_TEST_WALKTHROUGH.md` for exact Medical/Fire coordinates and stages. Duty alone does not enable GPS; consent and fresh device position are required. Browser automation explicitly simulates geolocation and does not prove physical GPS/background behavior.

A Fire incident is visible only to authorized Fire scope (or Admin), even with no eligible team. Medical Authority intentionally cannot access it. Use **Authority — Fire and Rescue** for Fire reports. Both fixtures use fictional exercise coverage near Mumbai; other configured categories are reportable but have no canned responder scenario in this release. Never tunnel fixture ports or expose them through a relay.

For an existing RC1 demo, follow the walkthrough's additive upgrade guidance and preserve its Compose project/volume and selected local database; do not reset/reseed unrelated data. There is no new migration or dependency change; migrations 001–008 and the exact lockfile are included. The seed adds Fire records without manufacturing locations or resetting existing Medical scope/duty/records.

## Changes in this task

Implementation: `scripts/seed.ts`, `apps/api/src/auth.ts`, `apps/web/src/main.tsx`, `apps/web/src/dashboard.tsx`.

Regression coverage: `tests/demo-fire.test.ts` (10 tests), `tests/browser/fire-workflow.spec.ts` (one additional browser journey). Existing tests and all earlier fixes are retained.

Documentation: `README.md`, `START_HERE.md`, `LOCAL_TEST_WALKTHROUGH.md`; `docs/CONFIGURATION.md`, `SECURITY.md`, `TESTING.md`, `POST_IMPLEMENTATION_AUDIT.md`, `IMPLEMENTATION_STATUS.md`, `DEPLOYMENT_READINESS_REVIEW.md`, `RELEASE_VERIFICATION.md`; new `docs/FINAL_MASTER_REVIEW.md` and `docs/AWS_DEPLOYMENT_PLAN.md`.

Public staging only: deployment approval defaults are disabled and historical private account authorization/contact/path details are removed. The manifest identifies all nine intentional public-copy differences. Application source, migrations, tests and lockfile match the verified working tree byte-for-byte. Original working configuration was not overwritten. The public RDS CA download helper is preserved; certificates are excluded. Run `node scripts/fetch-rds-ca.mjs` before offline synthesis or RDS artifact builds, using verified HTTPS as described in `certs/README.md`; never disable TLS verification.

## AWS and remaining limits

**No AWS resources, IAM/SCP policies, production migrations or deployment pipeline were changed.** AWS identity checks were blocked by a missing selected profile, then `ExpiredToken` for available environment credentials. Current effective SCP/IAM, credits, quotas and live configuration remain unverified. Prior organization-policy denies need an authorized organization administrator's review; IAM AdministratorAccess cannot override an explicit SCP deny. Publication grants no cloud deployment authorization.

`docs/AWS_DEPLOYMENT_PLAN.md` provides the exact ordered post-approval commands, permission/secret prerequisites, backup/rollback, manual frontend publication and live acceptance. The selected architecture uses Amplify, API Gateway/private ALB/ECS API, private RDS and Lambda/SQS/Scheduler worker. The optional pipeline deploys ECS only; database/worker/frontend changes must be coordinated separately.

Planning estimate (not a current price quote): roughly $100–180/month continuous small stack, or $5–15 for a light one-day exercise, subject to actual Mumbai pricing, traffic, credits and retained resources. Budgets are alerts, not spending caps; no automatic shutdown is implied. Verify current credits and approve resources/costs before deployment.

- Native Windows, live AWS/Cognito/S3/Location/SMS/SES, physical GPS/background devices, production load/failover and live RDS restore: **NOT RUN**.
- Dependency audit passed the high-severity threshold but reports **two moderate findings** in CDK/nested minimatch (GHSA-g3hv-75wg-m249). npm's proposed forced breaking CDK downgrade was not applied. Exact lockfile preserved.
- Full image malware scanning/EXIF stripping and distributed rate limiting are absent; broad worker evidence permissions warrant separate hardening. Browser push/native background GPS are not implemented.
- Existing MapLibre bundle-size, CDK deprecation/feature-flag and test color-environment warnings remain. No unexplained final verification failure remains.

**Locally verified and built successfully; not deployed, not live-service verified, and not approved for operational emergency use.**
