# Response — release candidate 2026.10.31-rc1

Released 31 October 2026. Complete Tasks 1–3 source, tests, migrations 001–008, infrastructure, documentation and exact dependency lockfile. This artifact branch is separate from main. Download the project ZIP itself; a checkout of main is not this release.

- [Download the complete project](https://raw.githubusercontent.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/downloads/response-2026-10-31-rc1/Response-2026.10.31-rc1.zip)
- [ZIP file page](https://github.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/blob/downloads/response-2026-10-31-rc1/Response-2026.10.31-rc1.zip)
- [Exact fresh-extraction commands/results](Response-2026.10.31-rc1.verification.json)
- [Every packaged file and public-copy differences](Response-2026.10.31-rc1.manifest.json)
- [Checksum](Response-2026.10.31-rc1.sha256)

Size: **834,904 bytes** (149 project files, one `Response/` root).

SHA-256:

```text
e92f746266ccb3ce817aeb58e75c822fc04b7d3248b47458914c373872ee1507
```

## Actual final archive verification

The exact ZIP was extracted into a completely fresh directory; manifests, paths, migrations and each file hash were checked. Linux x86_64, Node 24.19.0/npm 11.9.0, PostgreSQL 16/PostGIS 3.5 and Chromium. Tests used separate review-owned local `_test` databases, not project data.

| Check | Result |
|---|---|
| Locked install | PASS: npm ci, 391 packages; unchanged lockfile; npm ls --all exit 0 |
| Focused regressions | PASS: 219/219, no skips |
| Full suite | PASS: 272/272, no skips |
| Browser suite | PASS: 21/21 |
| TypeScript / lint / production build | PASS: all exit 0 |
| Public RDS CA helper | PASS: verified HTTPS and X.509 parsing; Node 24 proxy setting required in this managed environment |
| Offline infrastructure | PASS: academic, reference and optional receipt variants, all synthesis and assertions exit 0 |
| Archive privacy/content review | PASS: no actual env files, credentials, certificates/private keys, caches/build/dependency/database artifacts or account-specific deployment grant; safe paths and matching manifest |

The preceding workspace review also passed the same test counts, the Node 22 Docker rebuild, repeat migrations, readiness/liveness failure/recovery, worker deadline recovery after restart, API restart and graceful shutdown. See `docs/RELEASE_VERIFICATION.md` inside the ZIP. These container checks were performed before packaging; they are not a claim of native Windows Docker validation.

An earlier candidate's direct public CA fetch failed with ECONNREFUSED/ENETUNREACH. The unchanged helper succeeded using `NODE_USE_ENV_PROXY=1` and the existing approved proxy/CA settings; TLS verification remained enabled. The final exact ZIP passed this prerequisite and all checks. Earlier Docker probes also encountered a read-only home directory and a too-short cold-container startup allowance; successful retries and initial errors are documented inside the package. No failing test was deleted, skipped or weakened.

## Start locally

Keep the old project and its configuration/database. Extract this ZIP into a new short path, open the inner `Response` folder in VS Code, install Node 22+ and start Docker Desktop with Linux containers:

```powershell
npm ci --cache .local/npm-cache
npm run setup:demo
npm run dev:demo
```

Open http://localhost:5173 and select Development / Demo Mode. Follow `LOCAL_TEST_WALKTHROUGH.md` for four-role sample values and scenarios. Keep demo ports private; do not tunnel them. Normal Cognito setup is separate. Actual environment files and certificates are excluded. Before offline infrastructure/RDS artifact preparation, run `node scripts/fetch-rds-ca.mjs`; `certs/README.md` documents secure proxy handling without disabling TLS.

## Task 4 changes

Workspace files changed only for CI/release documentation: `.github/workflows/ci.yml`, `certs/README.md`, `README.md`, `START_HERE.md`, `LOCAL_TEST_WALKTHROUGH.md`, and `docs/CONFIGURATION.md`, `docs/DEPLOYMENT_READINESS_REVIEW.md`, `docs/PACKAGE_VERIFICATION.md`, `docs/POST_IMPLEMENTATION_AUDIT.md`, `docs/RELEASE_VERIFICATION.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TESTING.md`. The workflow fetches the public RDS CA then synthesizes/asserts offline; docs describe the current archive, results and limits. Earlier Tasks 1–3 source/test changes are all preserved. No dependency or migration rewrite occurred.

Only public staging copies reset historical approval/account metadata and redact old account-specific documentation/path details. The manifest names all nine deliberate public-copy differences. Application source, tests, migrations, manifests and lockfile match the verified working tree byte for byte. Source working configuration was not overwritten. Screenshots depict labeled demo/illustrative screens, not private user records.

## Warnings and unverified gates

- Native Windows, live Cognito/S3/Location/SMS/email/AWS, physical-device GPS/background delivery, live RDS restore and production load/failover: **NOT RUN**. No AWS resources/IAM were changed and no live deployment is claimed.
- npm audit at the high-severity threshold passed but reported **two moderate findings** in `aws-cdk-lib`/nested `minimatch` (GHSA-g3hv-75wg-m249); no available fix was reported. Lockfile unchanged. Existing MapLibre bundle-size, CDK feature/deprecation and test color-environment warnings remain.
- Upload scanning/EXIF sanitization, distributed rate limiting, native background GPS and operational emergency approval remain outside this local verification. Never forward fixture ports through a transparent local relay.
- AWS pipeline updates ECS only; coordinated migrations, Lambda worker and frontend deployment need separate review. Budget alerts are not spending caps. Public source publication grants no resource-creation authorization.

This is a locally verified release candidate, **not a production-ready or officially connected emergency system**.
