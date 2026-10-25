# API guide

Base path: `/api/v1`. Machine-readable contract: [openapi.json](openapi.json). All application routes require the opaque `response_session` cookie. `GET /auth/me` returns the current profile and CSRF token. Mutations require `Origin` equal to `APP_ORIGIN` and `X-CSRF-Token`. The server does not accept client-supplied roles or owner IDs as authorization.

Responses are JSON except OAuth redirects, SSE and map assets. Errors: `{ "error": { "code": "…", "message": "…" } }`; 400 validation, 401 session, 403 forbidden/CSRF, 404 inaccessible resource, 409 state/capacity conflict, 429 rate limit, 503 missing dependency. Unknown server errors do not expose stack traces. Lists default to 30, maximum 100 where pagination is supported; endpoints with fixed limits document that limit in code.

## Authentication and health

- `GET /health` liveness; `GET /health/ready` checks DB/schema without secrets.
- `GET /auth/config`: mode, identity readiness, SSE/poll transport and optional configured emergency-call number.
- `GET /auth/login`, `/auth/register`, `/auth/recover`: state/PKCE-protected Cognito managed sign-in, citizen registration and password recovery.
- `GET /auth/callback`: code exchange, verified identity, citizen-only profile creation, session cookie.
- `GET /auth/me`: session profile and CSRF token.
- `POST /auth/logout`: local revocation, location stop, provider revocation attempt, optional Cognito logout URL.
- `POST /auth/demo`: four predefined local demo emails only, unavailable in production. No public production admin registration.
- `PATCH /users/me`: `{name}` only.

## Incident and dispatch lifecycle

`GET /catalog` returns DB-managed categories, departments and jurisdictions.

`POST /incidents` (or `/emergency-requests`) requires `Idempotency-Key` (8–120 characters). Example:

```json
{"kind":"EMERGENCY","category":"MEDICAL","severity":"HIGH","latitude":19.076,"longitude":72.8777,"description":"Controlled test only","address":""}
```

Coordinates are validated; description/address are optional. Citizen reports are professional-risk **inputs**, not verified diagnoses. Repeated key + identical body returns the same report. Changed body + same key returns 409. `GET /incidents?limit=30&offset=0` is scoped; `GET /incidents/{id}` includes history and assignments.

`POST /incidents/{id}/status` accepts `{status,note?}` and checks state rules. Operational milestones come from assignments, not arbitrary status writes. Citizens can cancel only unacknowledged reports. Authorities can acknowledge, verify, flag duplicates, reopen and resolve only according to the state machine.

- `GET /incidents/{id}/eligible-teams`: scoped, qualified, available teams within 25 km.
- `GET /incidents/{id}/duplicates`: up to 20 scoped same-category candidates within 250 m / 24 h, for human review.
- `GET /incidents/{id}/escalations`: persisted stages/outcomes.
- `POST /incidents/{id}/escalate`: durable manual review.
- `POST /incidents/{id}/publish`: `{published:boolean}`, sensitive categories prohibited.
- `POST /assignments`: `{incidentId,teamId}` plus `Idempotency-Key`; authority/admin only, capacity locked.
- `POST /assignments/{id}/status`: `{status}`; responders accept/decline and report progress; only dispatchers authorize dispatch or cancel.

Incident states: SUBMITTED → ACKNOWLEDGED → DISPATCHED → TEAM_EN_ROUTE → TEAM_ON_SCENE → RESOLVED, with guarded verification/duplicate/cancel/unable/reopen alternatives. Assignment states: OFFERED → ACCEPTED → DISPATCHED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED, with DECLINED/CANCELLED alternatives.

## Tracking and evidence

- `POST /locations/sessions`: `{teamId}`, on-duty team member only; one active source per team.
- `POST /locations/updates`: `{sessionId,latitude,longitude,accuracy,observedAt}`; recent monotonic sample required.
- `DELETE /locations/sessions/{id}`: source user only.
- `GET /locations/incidents/{id}`: scoped coordinates, LIVE/STALE status, last update, straight-line distance, optional route distance/duration.
- `GET /incidents/{id}/events`: authorized SSE refresh channel; closes on revocation/expiry/access loss. Contains no global location payload.
- `GET /locations/map/style` and map asset subpaths: signed AWS Location proxy; 503 when not configured.
- `POST /evidence/upload`: `{incidentId,contentType,size}` → two-minute private S3 POST policy; reporter only.
- `POST /evidence/{id}/complete`: server verifies metadata/magic bytes, copies the validated version outside the upload prefix, then makes the reference available.
- `GET /evidence/{id}`: authorized 60-second attachment URL; no public bucket.

## Operations

- `GET /teams`; `POST /teams/{id}/duty` with `{availability}`; `POST /teams/{id}/assistance` with `{incidentId}`.
- `GET /resources`; `POST /resources/{id}/allocate` with `{incidentId,quantity}`; `POST /resources/allocations/{id}/release`. Transactional inventory limits and scope apply.
- `GET /announcements`; `POST /announcements` with `{title,body,audience,importance,expiresAt}`; `PATCH /announcements/{id}` adds `cancelled`. Mutation requires authorized publisher.
- `GET /situation`: reviewed, non-sensitive, approximate public-feed data for signed-in users.
- `GET /notifications`: recipient's own entries; `POST /notifications/{id}/read`. Read does not acknowledge an incident.
- `GET /metrics`: scoped incident-state counts.

## Administration (ADMIN only)

- `GET/POST /admin/users`: controlled Cognito invitations. Allowed provisioned roles are AUTHORITY and RESCUER, never ADMIN. Body: `email,name,role,departmentId,jurisdictionId,teamId?`, and permissions `DISPATCH`/`ANNOUNCE`. Rescue users require a matching team.
- `POST /admin/users/{id}/status`: ACTIVE/SUSPENDED/INACTIVE; cannot modify self/admins. Returns whether Cognito synchronization succeeded.
- `POST /admin/teams`: name, departmentId, jurisdictionId, capacity (1–5), vehicle, capabilities.
- `POST /admin/departments`: `{name}`.
- `POST /admin/jurisdictions`: `{name,west,south,east,north}` validated rectangular region.
- `PUT /admin/categories/{code}`: label, sensitive, departmentIds, requiredCapabilities.
- `GET /admin/policies`; `PUT /admin/policies/{id}` with `{radii,delays}`. Arrays must match, radii nondecreasing, delays strictly increasing starting at zero.
- `POST /admin/resources`: name, type, departmentId, jurisdictionId, teamId?, quantity.
- `PATCH /admin/resources/{id}`: status, quantity; cannot reduce below current allocation.
- `POST /admin/notifications/{id}/retry`: only definite failures, bounded attempts; unknown provider outcomes require reconciliation.
- `PATCH /admin/users/{id}/organization`: departmentId, jurisdictionId, optional teamId/supervisorId and explicit permissions; admin/self modification prohibited; existing sessions and tracking revoked.
- `GET /admin/notification-config`: sending enabled status and masked recipient configuration, no phone values.
- `GET /incidents/{id}/resource-allocations`: scoped allocation/release history.
- `GET /admin/audit`; `GET /admin/health`.

External integration failures never return fabricated success. Live AWS acceptance tests and API-only management actions are detailed in implementation status.

## Academic expansion endpoints

- `GET /metrics/operations?days=30`: authority/admin only, 1–90 day bounded incident outcomes/milestone times, category counts and current team/inventory utilization. Department/jurisdiction filtering is enforced in SQL.
- `GET /locations/search?q=...`: authenticated, 3–200 characters, at most five Amazon Location results; 503 if unconfigured.
- `GET /resource-locations`: published sites plus the viewer's authorized private locations. No public endpoint exposes unpublished inventory locations.
- `GET/POST /admin/organizations`; `PATCH /admin/organizations/{id}` with `{name,active}`. Deactivation rejects active assignments and stops the organization's location sessions.
- `GET /admin/team-details`: team configuration, members and qualification expiry. `PATCH /admin/teams/{id}` accepts `{name,organizationId,vehicle,capacity,capabilities:[{capability,expiresAt}]}`. Active assignments block configuration changes. Expired qualifications prevent eligibility.
- `POST /admin/users/{id}/resend-invitation`: only an active operational account with a pending Cognito temporary-password invitation. Accepted identities use password recovery.
- `PATCH /admin/users/{id}/notification-preferences`: `{phone: E.164-or-null,smsEnabled:boolean}`; global sending remains separately disabled. Phone values are not written to audit details.
- `GET /admin/notification-jobs`: latest 100 notification statuses and attempt outcomes, without destination phone numbers. Existing bounded retry endpoint accepts only definitive failures.
- `PATCH /admin/resources/{id}/location`: `{latitude:number|null,longitude:number|null,address,publiclyListed}`. Coordinates must lie inside the resource jurisdiction; publishing without a location is rejected.

SMS delivery ingestion is a restricted CloudWatch-to-Lambda entrypoint, not a public HTTP webhook. The academic deployment uses authenticated five-second polling of existing incident/tracking endpoints; the custom-domain reference retains SSE.
