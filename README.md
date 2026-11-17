# Response local coordination repair — 17 November 2026

This additive repair is for an existing, unmodified RC2 project. It preserves user reports, coordinates, assignments, history, old accounts and Mumbai coverage. It adds missing RC2 Fire fixtures plus separate Pune Medical/Fire exercise identities and teams. The new bounded fictional exercise area is longitude 73.75–74.00, latitude 18.40–18.65; this is not an official administrative boundary. Department and geography restrictions remain in force. No GPS, assignment or dispatch is fabricated.

## Download

- **[Windows-compatible Node updater](https://raw.githubusercontent.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/downloads/response-2026-11-17-local-repair/Apply-Response-PuneRepair-2026.11.17.mjs)** · [file page](https://github.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/blob/downloads/response-2026-11-17-local-repair/Apply-Response-PuneRepair-2026.11.17.mjs)
- [Complete repaired source ZIP](https://raw.githubusercontent.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/downloads/response-2026-11-17-local-repair/Response-2026.11.17-local-repair.zip) · [file page](https://github.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/blob/downloads/response-2026-11-17-local-repair/Response-2026.11.17-local-repair.zip)
- [Updater instructions and preservation/rollback details](LOCAL_REPAIR.md)
- [Exact fresh archive commands/results](Response-2026.11.17-local-repair.verification.json)
- [Updater, preservation and backup-restore results](Response-PuneRepair-2026.11.17.installer-verification.json)
- [Source manifest](Response-2026.11.17-local-repair.manifest.json)

The updater is **228,651 bytes**; SHA-256:

```text
898e678fc3f4319ffa14836a39e495e88cdb63960ce695fca9cc03fed29244ff
```

The complete ZIP is **872,105 bytes**, 159 files under `Response/`; SHA-256:

```text
94c955bde12cd79ecf9e21fa32a69a836fd01a8de95f77e53fd710b9bd8d56d1
```

## Apply without editing source files

Use Node 24 LTS and running Docker Desktop with the existing local database. Close application terminals first; keep the database running. Download the updater into your Downloads folder, then in the inner existing RC2 `Response` folder run:

```powershell
node "$env:USERPROFILE\Downloads\Apply-Response-PuneRepair-2026.11.17.mjs" "$PWD"
if ($LASTEXITCODE -ne 0) { throw 'Repair stopped; keep the backups and inspect the error.' }
npm run dev:demo
```

No elevated PowerShell execution policy is needed for this Node file. Do not run a database reset, reseed, migration or `docker compose down -v`. The updater checks expected RC2 source/schema/lockfile hashes, refuses custom source rather than overwriting it, backs up affected source/configuration, and uses the exact dependency lockfile. An existing `.env.demo` is preserved; if absent the known local example is copied. It requires explicit local demo settings and a uniquely matching loopback PostgreSQL container on a local Docker socket/named pipe. It does not start, stop or create containers, or silently kill app processes.

The repair creates a checked logical database backup before one transactional additive fixture operation. Source/configuration and database backups remain under `.local/backups` on your computer and contain private information: never publish them. Conflicting/customized identities, scopes, boundaries, team membership or expired qualifications cause rollback rather than being overwritten. The script does not migrate an incompatible schema. Restore only to a separate database first; never overwrite an operational database blindly.

Open http://localhost:5173/development. Choose **Authority — Pune Medical exercise** for Medical reports or **Authority — Pune Fire exercise** for Fire reports. The corresponding **Rescuer — Pune Medic 01** and **Rescuer — Pune Fire 01** start OFF_DUTY with no GPS. Start duty and explicitly share fresh device location. Authority acknowledges and offers an eligible team; only then does the incident appear in the Rescuer's assigned queue. Acceptance, dispatch, en route, arrival and completion stay distinct. Original Mumbai accounts intentionally remain restricted to Mumbai.

A complete source ZIP is also supplied, but extracting it does not repair an existing database. For a new empty development installation, original `setup:demo` creates the base six fixtures; the explicit `repair:demo` adds the four Pune identities. The complete repair source exposes ten choices, some unavailable until repair runs. Do not use fresh setup as a shortcut for an existing database.

## Actual verification

All results are local Linux x86_64 / Node 24.19.0 / PostgreSQL 16 + PostGIS 3.5 / Chromium. Native Windows was **NOT RUN**, and the updater has **not been applied to the user's laptop by this workspace**.

| Check | Result |
|---|---|
| New API/fixture repair cases | PASS: 16/16 |
| Full workspace suite | PASS: 298/298, no skips |
| Workspace browser suite | PASS: 24/24 |
| Fresh exact ZIP locked install and dependency tree | PASS: npm ci; npm ls --all; lockfile unchanged |
| Fresh focused regressions | PASS: 245/245, no skips |
| Fresh full suite | PASS: 298/298, no skips |
| Fresh browser suite | PASS: 24/24; simulated geolocation explicitly labeled |
| Fresh typecheck, lint, production build | PASS: exit 0 each |
| Fresh offline infrastructure | PASS: academic/reference/receipt variants, all syntheses and assertions |
| Public RDS CA helper | PASS: verified HTTPS; proxy-aware Node setting only |
| Updater applied to extracted original RC2 | PASS: four-account fixture database became ten accounts/four teams, existing rows preserved |
| Backup restore into separate test database | PASS: pre-repair incidents/profiles/teams/jurisdictions matched restored rows |
| Repeat updater | PASS: original and added rows preserved |
| Occupied app port/customized source | PASS: updater refused both before changes (expected exit 1) |
| Archive/updater privacy review | PASS: no actual credentials, private incidents, environment files, databases, certificates, generated outputs or account-specific deployment authorization |

The initial updater test harness omitted the required `kind` field in a synthetic incident and received SQLSTATE 23502 before invoking the updater. Correcting that disposable fixture resolved it. This was not an application/schema defect; the error is retained in the verification record. Private diagnostics used the supplied incident locations; published tests use distinct fictional coordinates instead. No real incident IDs or personal contact details are included.

## Changes and limits

Implementation: `package.json` adds `repair:demo`; `apps/api/src/auth.ts` adds four fixed fixture aliases behind existing transport/mode guards; `apps/web/src/main.tsx` adds four clearly scoped choices; `apps/web/src/dashboard.tsx` clarifies unassigned responder behavior. New `scripts/local-demo-fixtures.ts`, `scripts/repair-demo.ts`, `scripts/run-demo-repair.mjs` perform guarded, conflict-checked transactional insertion and backup. New `tests/demo-pune.test.ts` and `tests/browser/pune-workflow.spec.ts` cover the repair and both departmental workflows. README, START_HERE, walkthrough, testing/status docs and new LOCAL_REPAIR instructions are updated in the full source ZIP. The updater includes the affected implementation/tests and the new repair guide; it does not overwrite existing historical documentation.

No migration, dependency version/lockfile, geographic access policy, GPS eligibility rule, production authentication, AWS template or IAM policy changed. All previous fixes remain. Public archive staging removes historical private deployment approvals; the manifest enumerates those existing public-copy differences. RC1, RC2 and main are not overwritten. This artifact branch contains no deployment workflow.

GPS permission/accuracy and actual assignment remain required. Runtime version must be selected by starting from the correct folder; changing a terminal directory alone does not switch a running server. Amazon Location maps, S3, Cognito and external notifications remain separate integrations, not required for these local database workflows. No cloud resources, external messages or AWS deployment were executed. Windows, physical-device/background GPS and live AWS acceptance are unverified. Existing CDK moderate advisories and bundle/deprecation warnings remain; dependencies were not upgraded in this repair.
