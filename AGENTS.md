# Project working rules

- Current approved AWS budget is **$0**. Use the local React/Express/PostGIS workflow for development and evaluation; no custom domain is required. Do not provision resources, enable SMS, purchase domains, or assume Free Tier makes the paid CDK reference architecture free.
- `config/deployment-policy.json` disables the paid reference deployment. The user now reports a Free plan with $120 credits/169 days for an academic demonstration. `config/academic-deployment.json` separately blocks the proposed credit-funded plan until its resource list, credit allowance and duration receive explicit approval. Preserve the $0 cash limit and never upgrade the account plan. Check identity, service eligibility and prices before provisioning.
- Credentials stay in approved environment/CLI configuration, never in code, logs, chat or Git. Existing credentials on a user's laptop may not be available in this cloud workspace.
- Use this existing checkout. Each cloud task is already isolated; do not create a worktree unless the user explicitly requests it.
- Run `npm run setup:local` and `npm run dev:local`. Use `npm test` only against a database name ending in `_test`; it resets that test schema. Browser tests create labeled fixtures in the local demo database.
- Preserve authorization, CSRF, transaction locks, idempotency, append-only audit records, location privacy, TLS validation and notification-state distinctions. A request is not acceptance, dispatch or arrival.
- Keep production Cognito/AWS integrations distinct from local demo identities and stubbed adapter tests. No live AWS acceptance result may be claimed without execution.
- Update `docs/IMPLEMENTATION_STATUS.md` and `docs/TESTING.md` when changing capabilities or validation outcomes.
