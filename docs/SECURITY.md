# Security and privacy

## Enforced boundaries

- Cognito authorization-code flow with PKCE, state cookie and single-use expiring database state. Backend RS256 verification checks issuer, expiration, token type and app client. ID token subject must match access token and email must be verified.
- Cognito production pool requires TOTP MFA for all users, stronger than privileged-only MFA. Deployment must validate managed-login enrollment/recovery behavior.
- Random 256-bit opaque session handles; only their hashes are stored. Refresh tokens are AES-256-GCM encrypted using a separate Secrets Manager key. Cookies are HttpOnly, Secure in production, SameSite=Lax, and path scoped. Access window is 15 minutes and sessions expire after seven days.
- Mutation requests require exact configured Origin and session-bound CSRF header. Session metadata is memory-only in the browser; no long-lived tokens in localStorage. Logout deletes local session, stops sharing and attempts provider refresh revocation.
- Profiles determine permissions; client role/owner injection is rejected by strict schemas. Authority department AND jurisdiction constraints are evaluated on the backend. Citizens see their own reports; rescuers see eligible assigned work only. All protected location reads apply incident and team authorization.
- Per-process IP rate limits protect API/authentication; JSON request limit 32 KiB. Scaling requires a shared rate-limit store or reviewed WAF policy; local limits are not a distributed abuse defense.
- Parameterized SQL, bounded result pages, assignment locks, resource-capacity locks, immutable audit/history/revision records and idempotent event consumption.
- Private encrypted S3 evidence: five attachments per report, JPEG/PNG only, five MiB maximum, signed upload policy, length/type/header checks, finalized copy outside the upload prefix, and short-lived authorized attachment downloads. Evidence authorization is checked before issuing a URL. These checks do not constitute malware scanning or full image decoding; add scanning and EXIF sanitization before operational use.
- RDS is private and encrypted; the runtime database login lacks DDL/role privileges and audit mutation. AWS IAM is separated between API, worker, migration, scheduler, pipeline and deployment. The API cannot read the database owner secret.
- No secrets in logs, source, frontend variables or CDK outputs. Structured application errors contain request IDs and event codes, not tokens, coordinates, phone numbers or report descriptions.

## Configuration obligations

Use approved short-lived AWS roles/SSO profiles. Do not put raw keys in chat or Git. `.env` is ignored; `.env.example` contains local-only disposable values. RDS trusts the official downloaded AWS CA bundle with verification enabled. Rotate database/app encryption secrets through a tested procedure: rotating the encryption key without re-encryption invalidates encrypted refresh sessions and requires sign-in.

Use same-site custom frontend/API HTTPS domains and test Amplify forwarding of cookies, Origin, SSE and cache headers. Cognito callbacks use the frontend `/api/v1/auth/callback` proxy path and must match exactly, so host-only session cookies are set on the correct browser origin. All sensitive responses use `Cache-Control: no-store`.

Controlled administrator bootstrap requires an existing verified, MFA-enrolled Cognito identity and database access through an approved operational path. The process is serialized and refuses when any admin exists. No reusable bootstrap secret or setup endpoint is created.

## Known deployment/security validation gaps

Live Cognito registration/MFA/renewal/revocation, RDS restore, S3 permissions and finalized-file flow, AWS Location route/map rights, SNS/SQS/Lambda retries, Amplify cookie/stream behavior and deployed IAM need approved AWS integration testing. Mocked provider-contract tests are not substitutes.

No independent penetration test, high-load test, official emergency-service integration, regulatory approval, medical triage validation, malicious-image scanner, or operational field validation has occurred. The system is not approved for actual emergency dispatch.

Operational admins can access sensitive records by design. Review governance, audit export, need-to-know permissions and jurisdiction-specific retention before real personal data is introduced. Public situation entries omit identity, free text, photos, IDs and exact location; sensitive categories are never published.
