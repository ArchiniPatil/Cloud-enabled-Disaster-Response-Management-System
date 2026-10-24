# Project working rules

- Current approved AWS budget is **$0**. Use the local React/Express/PostGIS workflow for development and evaluation; no custom domain is required. Do not provision resources, enable SMS, purchase domains, or assume Free Tier makes the paid CDK reference architecture free.
- `config/deployment-policy.json` disables paid deployment. A later nonzero budget and explicit user approval are prerequisites to changing that policy and provisioning. Check actual identity, quotas and pricing before any future deployment.
- Credentials stay in approved environment/CLI configuration, never in code, logs, chat or Git. Existing credentials on a user's laptop may not be available in this cloud workspace.
- Use this existing checkout. Each cloud task is already isolated; do not create a worktree unless the user explicitly requests it.
- Run `npm run setup:local` and `npm run dev:local`. Use `npm test` only against a database name ending in `_test`; it resets that test schema. Browser tests create labeled fixtures in the local demo database.
- Preserve authorization, CSRF, transaction locks, idempotency, append-only audit records, location privacy, TLS validation and notification-state distinctions. A request is not acceptance, dispatch or arrival.
- Keep production Cognito/AWS integrations distinct from local demo identities and stubbed adapter tests. No live AWS acceptance result may be claimed without execution.
- Update `docs/IMPLEMENTATION_STATUS.md` and `docs/TESTING.md` when changing capabilities or validation outcomes.
