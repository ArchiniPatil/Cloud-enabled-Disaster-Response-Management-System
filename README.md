# Response: demo-authentication source package

This download branch contains the exact verified source ZIP produced on 29 October 2026. It is an artifact-only branch; it does not replace main or deploy the application.

Package: `downloads/Response-Local-DemoAuth-Linux-Verified-2026-10-29.zip`

SHA-256: `4f1fdb85046d2d25474b6688a442492db156c6c95b0a0a1ff16017b3e164c070`

Extract into a new folder and open its inner `Response` directory. Read `docs/PACKAGE_VERIFICATION.md` in the extracted project for installation instructions and the recorded failures/limitations.

Linux verification: 69 security tests, 122 full-suite tests, and 11 browser tests passed. Lint, TypeScript, production build and local smoke passed. The exact final ZIP was freshly extracted, installed using its unchanged lockfile, and passed all 122 full-suite tests.

This is the complete source distribution of the current demo-authentication baseline. Database-readiness, production-configuration and emergency-workflow repairs remain pending. Native Windows, physical remote clients and live AWS/Cognito were not verified. No AWS resources were provisioned.
