# Operational redesign audit — 25 October 2026

Reviewed the existing frontend entry/shell/report/detail/team/admin/notification pages and shared map, metrics and management components; API routing/authentication/scopes/incident transactions/location/evidence/jobs; migrations and seed; environment launchers; Docker/Vite/test configuration; CDK identity/full-stack and Windows handoff. Preserve the existing TypeScript/React/Express/PostGIS design and AWS adapters.

Working foundations: opaque cookie sessions, Cognito PKCE, CSRF, role/jurisdiction/assignment scope, transactional offers/capacity checks, separate assignment/incident lifecycles, durable escalation/outbox, private evidence, location freshness, audited administration and reference-data migrations. Prior tests cover real local PostGIS with stubbed AWS providers, not live AWS acceptance.

Observed gaps before changes:

- Landing is marketing-led and exposes four development shortcuts directly. Shell uses small text/light navigation and dashboards are substantially shared between roles.
- Dashboard statistics count at most the first 30 reports. Queue filters are client-side; there is no server-filtered priority search, aggregate summary or incident operations map.
- Local fixture authentication requires explicit demo mode and seeded identities. The earlier Windows Bash failure prevented setup; old/unconfigured Cognito mode cannot authenticate demo identities. Current demo endpoint correctly rejects production/Cognito access.
- A browser at 127.0.0.1 does not match the default localhost origin, causing a reproducible local origin rejection. Normal CSRF/origin enforcement must remain strict in production.
- The frontend session refresh catches all failures and clears the user, so a successful login followed by a failed session request can appear to do nothing. Other 401 responses do not centrally clear a revoked session.
- Reporting lacks affected-person estimates, hazards, coordinate uncertainty and append-only supplementary updates. Assignment decline/completion do not require a recorded reason/outcome.
- Notifications persist in-app/SMS states, but local external delivery has no explicit simulated state, and email incident delivery is not implemented.
- Destructive admin controls are inconsistently confirmed. Provider flags indicate configuration, not verified connectivity.

Implementation direction: preserve existing backend invariants, add additive migrations, scoped server summaries/filters/activity, an operational navy/neutral UI, separate explicit development access, useful role dashboards and provider-error/empty states. Verify authentication failures, unauthorized access, new report/assignment fields and all role workflows. No AWS provisioning or live notifications are part of this redesign.
