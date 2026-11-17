# RC2 local coordination repair — 17 November 2026

This opt-in repair preserves existing incidents, coordinates, history, assignments,
Mumbai accounts and jurisdiction geometry. It adds the missing RC2 Mumbai Fire
fixtures and four separate Pune exercise identities. No schema migration or
dependency change is required. It is not an AWS deployment or an official service
area definition.

## Apply to an existing RC2 project on Windows

Use the standalone `Apply-Response-PuneRepair-2026.11.17.mjs` updater from the
separate release download branch. Keep Docker Desktop and the existing database
running. Close the API/web/worker terminals first; the updater refuses occupied
API/Vite ports rather than killing processes. Do not run `setup:demo` or delete
volumes as a substitute for this repair.

From the inner RC2 `Response` folder in PowerShell, run the downloaded file:

```powershell
node "$env:USERPROFILE\Downloads\Apply-Response-PuneRepair-2026.11.17.mjs" "$PWD"
npm run dev:demo
```

The updater checks the original RC2 application/schema/lockfile hashes (or its own
already-applied hashes). It stops if source has been customized or the wrong
release is selected. It backs up changed source and any existing `.env.demo` in
`.local/backups/source-update-*` before writing files. It never replaces an
existing `.env.demo`; if absent, it copies the verified local example. It runs a
locked install and `npm run repair:demo` against that selected local database.
Only a local Docker socket/Windows named pipe and a uniquely matching loopback
PostgreSQL container are accepted. No container or database is created by repair.

The repair command requires demo mode, non-production configuration, local
database addressing, no secret-backed connection, simulator notifications and
the existing complete 001–008 schema. Before database changes it takes a logical
`pg_dump` and configuration backup, verifies successful dump completion and records
a checksum under `.local/backups/demo-repair-*`. These backups contain private
data/configuration: keep them locally and never upload/publish them. They omit
cluster roles and ownership/grants; they are not a production disaster-recovery
backup. Windows file ACLs depend on your user folder configuration.

Fixture insertion is one transaction under the existing seed advisory lock. Name,
scope, status, membership, duplicate-team, boundary and expired-qualification
conflicts stop the repair rather than overwrite existing configuration. Successful
application records a local configuration audit event. Repeating repair does not
duplicate fixture accounts/teams or reset duty/GPS. An audit event records each
successful invocation.

If a step fails, stop and retain the printed backup path. Do not reset or reseed.
The updater may have installed repaired source before a later backup/database
check fails; its source backup remains available. Database insertion failures roll
back. Restore a database backup only into a separate database first, verify it,
and review any later writes before deciding on cutover. Never restore blindly over
the existing database. A fresh release ZIP does not update your laptop by itself.

## Accounts and scope

The login selector has ten choices after installing this source. Existing six
Mumbai/Citizen/Admin options retain their selector values and scope. The explicit
repair adds:

| Select this option | Fixture identity | Team/capability |
|---|---|---|
| Authority — Pune Medical exercise | `pune-medical-authority@demo.invalid` | Medical / Ambulance |
| Rescuer — Pune Medic 01 | `pune-medical-rescuer@demo.invalid` | Pune Medic 01 — Demo / FIRST_AID |
| Authority — Pune Fire exercise | `pune-fire-authority@demo.invalid` | Fire and Rescue |
| Rescuer — Pune Fire 01 | `pune-fire-rescuer@demo.invalid` | Pune Fire 01 — Demo / FIRE |

The new, explicitly fictional exercise polygon is longitude **73.75–74.00**,
latitude **18.40–18.65**. It does not replace or enlarge either Mumbai polygon.
Medical and Fire department restrictions still apply within it. This is an
operator-approved local exercise configuration, not a claim of jurisdiction over
real emergency services. Reports outside this bounded area stay out of scope.

No report is moved/recreated; new authorities can query already-saved matching
reports. Historic submission notifications are not fabricated/replayed. New teams
start OFF_DUTY with no coordinates and no sharing session. Availability alone is
not GPS consent, eligibility, an offer or dispatch. Old Mumbai accounts will still
not see Pune reports; select the appropriately labeled new Authority.

## Verify locally

1. Use separate browser profiles for Citizen, the matching Pune Authority and the
   matching Pune Rescuer. Open `http://localhost:5173/development`. Confirm all ten
   choices, then sign in using the labeled Pune account.
2. The correct Authority should see existing reports within its department and
   exercise polygon even with no eligible responder. The other department and
   original Mumbai Authority must not see them.
3. On the matching Rescuer's Teams page, start duty, choose Share device location
   and explicitly grant permission. Keep its tab active. If device location is
   outside the exercise, too inaccurate or stale, do not falsify it to claim a live
   response. For a clearly labeled desktop exercise only, DevTools Sensors can
   simulate a position; document that it is simulated.
4. Optional new fictional sample reports: Medical at **18.48, 73.87**; Fire at
   **18.56, 73.94**, severity HIGH. Use nearby simulated team positions only for the
   labeled exercise. Never use actual emergencies for this test.
5. Authority acknowledges, finds eligible teams and offers the matching team.
   Rescuer's assigned queue changes from empty to the offered incident. Rescuer
   accepts; Authority authorizes dispatch; Rescuer records En Route, Arrived,
   In Progress and Completed with an outcome. Citizen sees the final history.
6. Navigate away from Teams during sharing; verify continuity. Explicit disable,
   off-duty and logout must stop sharing. Real device/background behavior remains
   a separate acceptance check.

The map provider is optional for local PostGIS scope/matching. No real SMS/email,
automatic assignment, fake GPS, production fixture access or broadened role
authorization is added. Existing regression suites remain unchanged; the repair
adds dedicated Pune/upgrade/rollback/security and browser cases. Exact release
results and native-Windows limitations are in the download branch verification
record. A Linux run does not establish Windows execution success.
