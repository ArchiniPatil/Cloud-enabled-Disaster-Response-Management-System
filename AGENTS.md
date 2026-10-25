# Project working rules

- On 25 October 2026 the user instructed AWS setup after review of a 24-hour, $30-credit plan. Proceed within that recorded scope once AWS identity and account eligibility are verified. Cash spend remains $0; no account-plan upgrade, SMS sending or domain purchase is authorized. Do not ask for the same deployment approval again.
- `config/deployment-policy.json` disables the paid reference deployment. The user now reports a Free plan with $120 credits/169 days for an academic demonstration. `config/academic-deployment.json` records approval for the scoped credit-funded deployment. Preserve the $0 cash limit and never upgrade the account plan. Check identity, service eligibility and prices before provisioning.
- Credentials stay in approved environment/CLI configuration, never in code, logs, chat or Git. Existing credentials on a user's laptop may not be available in this cloud workspace.
- Use this existing checkout. Each cloud task is already isolated; do not create a worktree unless the user explicitly requests it.
- Normal local setup/startup uses real Cognito accounts: `npm run setup:local` and `npm run dev:local`. Sample accounts require explicit `setup:demo` / `dev:demo` commands and .env.demo. Use `npm test` only against a database name ending in `_test`; it resets that test schema. Browser tests create labeled fixtures in the local demo database.
- Preserve authorization, CSRF, transaction locks, idempotency, append-only audit records, location privacy, TLS validation and notification-state distinctions. A request is not acceptance, dispatch or arrival.
- Keep production Cognito/AWS integrations distinct from local demo identities and stubbed adapter tests. No live AWS acceptance result may be claimed without execution.
- Update `docs/IMPLEMENTATION_STATUS.md` and `docs/TESTING.md` when changing capabilities or validation outcomes.
