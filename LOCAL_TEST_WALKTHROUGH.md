# Run and demonstrate Response on your laptop

This walkthrough uses the integrated React frontend, Express API, PostgreSQL/PostGIS database and background worker. Every report, assignment, update and audit record is persisted locally. The four clearly labelled local identities need no AWS account or password. Real email/password registration is intentionally still Cognito; this release does not replace that authentication design.

## 1. Open the right folder

Install **Node 24 LTS**, **Docker Desktop** (Linux containers) and VS Code. Start Docker Desktop. Extract `Response-Local.zip` to `C:\Projects` so that **`C:\Projects\Response\package.json`** exists. Avoid nesting the long GitHub archive folder twice. Keep your older project and database until this release works.

In VS Code open `C:\Projects\Response`, then **Terminal → New Terminal**:

```powershell
cd C:\Projects\Response
npm run setup:demo
npm run dev:demo
```

Run the second command only after setup finishes successfully. Setup installs locked dependencies, starts the database, applies migrations and seeds the four users plus the medical team/catalog. It does not delete an existing database or invent incidents. The first run needs internet for npm packages and the database image. Later local workflows do not need an AWS account. If PowerShell blocks `npm.ps1`, use `npm.cmd` in its place.

Open **http://localhost:5173**. Leave the terminal running. The frontend is on 5173, API/worker use the local database, API is on 4000, PostgreSQL on 5432. This is local operation, not public hosting.

**Sign in** on the main page is for Cognito. For this local walkthrough, click **Open Development / Demo Mode**, select a role, then **Continue with local account**. No password is needed or embedded in the project. The warning banner remains visible on purpose.

## 2. Use separate browser profiles

Use three separate Chrome profiles (Citizen, Authority, Rescuer) or different browsers. Tabs within one profile share the same login cookie. Two incognito windows usually share one incognito session too. Keep a fourth profile for Administrator if convenient.

| Role choice | Fixture account | Initial scope |
|---|---|---|
| Citizen | `citizen@demo.invalid` | Own submitted reports |
| Authority | `authority@demo.invalid` | Medical / Ambulance, Mumbai demo area; dispatch/announcement permissions |
| Rescuer | `rescuer@demo.invalid` | Medic 01 — Demo; FIRST_AID capability |
| Admin | `admin@demo.invalid` | Administration and audit |

These `.invalid` addresses cannot receive real email. The local worker records external notification attempts as **SIMULATED**, with no provider calls. Local registration, Cognito invitations, AWS evidence upload, AWS maps/address search and external email/SMS are not available without their services. Manual coordinates, scoped incident lists, assignment actions, in-app notifications and all the steps below work locally.

## 3. Prepare the responder first

The seeded team operates in Mumbai. Matching requires fresh, accurate location, duty, qualification, capacity and jurisdiction; it will correctly reject a device elsewhere. For a repeatable laptop exercise, explicitly simulate **only your test browser's geolocation**:

1. In the Rescuer Chrome profile open localhost and sign in as Rescuer.
2. Open Chrome DevTools (F12 or Ctrl+Shift+I).
3. Press Ctrl+Shift+P, type **Show Sensors**, and select it.
4. Under **Location**, choose **Other…** and enter **latitude `19.077`**, **longitude `72.878`**. If Chrome asks for accuracy, use **`20` metres**. Leave DevTools open so the override stays active. This is a simulated test position, not real GPS.
5. In **Teams & resources**, choose **Start duty**, then **Share device location**. Allow browser location permission. Confirm “Your device is sharing operational location.”
6. Leave this tab open. Use a second tab **in the same Rescuer profile** for assignments. Navigating away from the sharing screen stops its watcher.

Do not use false test locations in a real operation. Remove the Sensors override when you finish. If geolocation is denied, allow it in localhost's site permissions and retry. If the team has an unfinished previous assignment, complete/cancel that assignment through its authorized workflow before repeating.

## 4. Submit the citizen report

In the Citizen profile choose **Need help** and enter:

| Field | Sample value |
|---|---|
| Category | Medical emergency |
| Severity | High |
| Latitude | `19.076` |
| Longitude | `72.8777` |
| Landmark or address | `LOCAL EXERCISE — Gate A, Mumbai training site` |
| Brief description | `LOCAL EXERCISE ONLY. One person needs first-aid assessment near Gate A. No real emergency.` |
| Estimated people affected | `1` |
| Immediate hazards | `LOCAL EXERCISE: uneven ground at the entrance; approach slowly.` |

Correct the latitude/longitude manually if your browser has filled your actual location. Leave evidence empty for this AWS-free exercise. Choose **Submit request**. Expect a saved confirmation, unique reference, status history and report details. Copy the incident page URL for the next roles.

Under **Add information**, enter `LOCAL EXERCISE: use the east entrance; a coordinator will meet the team.` and click **Add update**. Confirm it appears with a timestamp. Updates are append-only; they do not rewrite the initial report.

## 5. Acknowledge, offer, accept and dispatch

1. **Authority:** open the incident URL or find it in Incident inbox. Search `Gate A`; try the Medical/High filters. Choose **Acknowledge**.
2. Choose **Find eligible teams**, select **Medic 01 — Demo**, then **Offer assignment**. Expect **Offered**, not dispatched.
3. **Rescuer:** in the second tab open the same incident URL. Review hazards and supplementary information. Choose **Accepted**. Acceptance still does not authorize travel.
4. **Authority:** choose **Authorize dispatch**.
5. **Rescuer:** choose **En Route**, **Arrived**, **In Progress**, then **Completed** in that order.
6. When asked for **Reason or outcome**, enter `LOCAL EXERCISE COMPLETE. First-aid assessment recorded; no outstanding simulated assistance needs.` and choose **Confirm Completed**.
7. **Citizen:** confirm the status and history update to **Resolved**, with the outcome. This is a stored workflow result, not proof that a real emergency occurred or was handled.

The team and incident coordinates are roughly 120 metres apart and inside the fixture jurisdiction. If no team appears, check category, duty, location freshness/accuracy, active sharing tab, FIRST_AID qualification, jurisdiction and team capacity. Never weaken those checks to make an exercise pass.

## 6. Exercise the remaining local screens

- **Notifications:** review in-app updates. A local external attempt shows SIMULATED, not DELIVERED. Worker processing can take a few seconds. Delivery/read status never counts as acceptance.
- **Resource allocation:** Authority opens the incident's resource console. Allocate **1** of **Demo medical kits** (10 seeded), verify available stock decreases, then release it and verify it increases. The backend rejects over-allocation.
- **Administrator:** open Administration → Configuration. Add department `Exercise Logistics`; add jurisdiction `Exercise zone` with west `72.80`, south `19.00`, east `72.95`, north `19.15`. These are additional test records; retain the seeded medical scopes for the walkthrough above.
- **Teams/organizations:** create `Exercise Support Group` in Administration → Teams. Review the seeded team and its actual capacity/member/capability records. Do not modify the team while a response is active.
- **Announcements:** Authority chooses Publish notice. Title: `LOCAL EXERCISE — Training briefing`. Message: `Training exercise only. Meet at Gate A. This is not a public emergency alert.` Choose an expiry one hour in the future using the local date/time picker. Publish, view as Citizen, correct, then withdraw it with confirmation.
- **Shelters/resources:** Admin can set a resource's location to latitude `19.075`, longitude `72.879`, address `LOCAL EXERCISE — Training supply point`, and publish the site if appropriate. The list remains usable without AWS maps; the map clearly reports unavailable.
- **Metrics and audit:** Authority/Admin can review recorded milestones, team workload and stock use. Admin → Audit shows account/configuration and response actions. Tables sort the rows already fetched; this does not imply server-wide sorting across pagination.
- **Decline:** on a separate new report, offer the idle team and choose Declined as Rescuer. Enter `LOCAL EXERCISE: equipment check required.` The team loses incident access after declining; the authority retains it.
- **Cancellation:** create another citizen report and cancel before acknowledgement. After acknowledgement the backend rejects citizen cancellation according to the existing policy.
- **Escalation:** create a separately labelled Critical medical report and leave it unaccepted. Review its escalation history at the configured deadlines (Administration → Configuration shows the actual radii/delays). No dispatch is fabricated. Current-cycle acceptance pauses automatic expansion; manual review remains authorized.
- **Privacy:** a Rescuer cannot open Administration; a citizen cannot open unrelated reports. Do not suspend the only sample authority/rescuer unless you intend to restore them as Admin.

Keyboard: **g then i** opens your inbox; **/** focuses queue search; **?** opens the shortcut guide. Shortcuts are inactive while typing. Sidebar collapse is remembered locally. Theme follows the operating system and motion follows its accessibility preference.

## 7. Stop, restart and keep data

Ctrl+C in the app terminal stops the application. Then:

```powershell
docker compose stop db
```

To resume later from the **same folder**:

```powershell
docker compose up -d --wait db
npm run dev:demo
```

The Docker volume retains reports. Docker Compose names volumes from the project directory unless configured otherwise; extracting into a differently named folder can create a different volume. Keep the old folder/volume until you decide whether to migrate its data. Do not use `docker compose down -v` as a repair step.

## 8. Troubleshooting and verification

While the app is running, use a second terminal:

```powershell
npm run doctor:local
npm run smoke:local
```

The doctor reports Node/Docker, configuration-file presence, listening ports and API/database readiness without printing secrets. Smoke checks local readiness, a citizen cookie session, scoped reports and logout in its own session.

If startup fails, capture the original frontend error rather than only npm's final summary:

```powershell
npm run dev -w apps/web *> vite-error.txt
notepad .\vite-error.txt
```

If port 5173 or 4000 is occupied, stop the old app in its terminal. If dependencies are missing, rerun setup successfully. If Docker is unavailable, start its Linux engine. Use a short path. Never continue after a failed setup and expect the database or packages to exist.

For the full verification suite, stop the application first so Playwright starts its own server:

```powershell
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

`npm test` resets only `response_test`; browser tests create labelled fixtures in the local development database. Tests do not contact emergency services. Linux/Chromium execution is verified; native Windows execution must still be confirmed on your laptop.

## 9. Connect AWS later

Keep the backend and provider architecture as shipped. Follow [the Windows AWS deployment guide](docs/AWS_WINDOWS_DEPLOYMENT.md) when ready. Cognito handles real registration/password/MFA, S3 handles evidence, Location supplies maps/routes, and configured AWS notification services handle external sends. No AWS provisioning is needed for this walkthrough. Previously observed organization-policy restrictions remain a separate deployment concern.
