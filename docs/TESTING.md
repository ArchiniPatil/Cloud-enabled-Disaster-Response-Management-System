# Test commands and actual results

Validation performed locally on 24 October 2026, using Node 24 on the host, Node 22 in the container, PostgreSQL 16 / PostGIS 3.5, and Chromium. No live AWS services were provisioned or used for acceptance testing.

| Command / check | Actual outcome |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` / `npm run build` | Passed; MapLibre's lazy-loaded map bundle has a size warning |
| `npm test` | **31 passed**, 2 files; no skipped tests |
| `npm run test:e2e` | **3 passed**; no skipped scenarios |
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

`npm test` requires a database name ending in `_test`. It resets only that schema. `npm run setup:local` creates `response_test`; `TEST_DATABASE_URL` can select another explicitly named test database. Never point it at operational data. Unit/integration tests run sequentially because the integration file exercises a full workflow and carefully restores SDK/configuration stubs.

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

For this correction, setup, lint, typechecking, development startup, the database/session smoke check, and all three browser scenarios (including automatic server startup) passed on Linux. A missing-environment check from a directory containing spaces also passed. Native Windows execution remains unverified in this environment. The full unit/integration suite still contains a Bash-based paid-deployment guard test; Windows users need Git Bash for that suite, but not for local app setup/startup or browser tests.

## Remaining acceptance gates

After approved AWS provisioning, run a real-identity and real-provider version of the workflow: Cognito enrollment/session renewal/revocation, least-privilege S3 and DB access, provider route results, bounded queue retries and DLQ recovery, validated SMS sandbox receipt handling, deployed SSE/cookies, alarm notification and RDS restore. Validate rate limits/load, timezone and jurisdiction edge cases, accessibility, malicious evidence handling, and operational policies before any real emergency use.
