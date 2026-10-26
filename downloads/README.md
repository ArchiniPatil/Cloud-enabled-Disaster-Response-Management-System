# Local laptop download

Download [Response-Local.zip](Response-Local.zip) using GitHub's **Download raw file** button, or [use this direct link](https://github.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/raw/refs/heads/main/downloads/Response-Local.zip).

This verified archive contains the 123 source/documentation files from commit `a73c0b88b12eec24fa16f92b2391e02fcbfea37e`, under a short `Response/` root. It excludes credentials, node_modules, local database data and this downloads directory (avoiding recursive ZIP packaging).

Extract to `C:\Projects`, open `C:\Projects\Response` in VS Code, start Docker Desktop with Linux containers, then run `npm run setup:demo` followed by `npm run dev:demo`. Open http://localhost:5173 and choose **Open Development / Demo Mode** to use the local accounts.

Read `LOCAL_TEST_WALKTHROUGH.md` inside the ZIP for the complete setup, four-role exercise and exact sample values. `DESIGN.md` explains the interface. The archive checksum is in [Response-Local.sha256](Response-Local.sha256).

The source passed 47 unit/integration tests, 11 browser scenarios, lint, TypeScript, production build, local setup and session/database smoke checks on Linux. Native Windows and live AWS are not claimed as verified. Real Cognito accounts, provider maps, evidence storage and external notifications require the documented AWS configuration.
