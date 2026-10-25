# Open and run Response in VS Code

This is the complete source repository: React frontend, Express backend, PostgreSQL/PostGIS schema, role and dispatch workflows, tests, Docker image, and AWS CDK infrastructure. The application has passed local tests. **The AWS stack has not been deployed or live-validated.** Real sign-in requires Cognito; S3 evidence, AWS maps/routes, queues and analytics require the corresponding AWS resources.

## 1. Download the whole project

[Download the ZIP](https://github.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System/archive/refs/heads/main.zip), then right-click it → **Extract All**. In VS Code, choose **File → Open Folder** and select the extracted folder that directly contains `package.json`, `apps`, `infra`, and this file. Do not open only `apps/web`, and do not run commands inside the ZIP.

If the ZIP link fails, sign in to GitHub, open [the repository](https://github.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System), and choose **Code → Download ZIP**. Alternatively, install Git for Windows and run:

```powershell
git clone https://github.com/ArchiniPatil/Cloud-enabled-Disaster-Response-Management-System.git
cd Cloud-enabled-Disaster-Response-Management-System
code .
```

Keep your old project folder and its local configuration/database volume until you have verified this version. The download deliberately excludes credentials, `node_modules`, build artifacts and local databases. Dependencies are restored by `npm ci`; private environment files are generated/configured on your computer.

## 2. Install prerequisites

- [Node.js](https://nodejs.org/) 22 or newer, including npm.
- [VS Code](https://code.visualstudio.com/).
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) using **Linux containers**, running before setup. Complete Docker's Windows/WSL2 installation requirements if prompted. Application setup itself does not invoke Bash or require you to use a WSL terminal.
- For AWS: [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and your securely configured AWS profile.

Restart VS Code after installation. Open **Terminal → New Terminal → PowerShell** in the project root:

```powershell
node --version
npm --version
docker version
docker compose version
aws --version
npm ci
```

Run commands one at a time; stop and resolve any nonzero exit/error before continuing. If PowerShell blocks `npm.ps1`, use `npm.cmd` and `npx.cmd` in the commands below. Do not globally disable your execution policy.

## 3. Choose how to run

| Goal | Instructions |
|---|---|
| Entire hosted system with real accounts and AWS integrations | Follow [AWS_WINDOWS_DEPLOYMENT.md](docs/AWS_WINDOWS_DEPLOYMENT.md) from Step 1. This is the full cloud path. No local `.env.cognito` is needed for hosted deployment. |
| Real Cognito accounts, application/database on your laptop | Follow the **Local application with real Cognito accounts** section of that guide, then use the commands below. AWS maps/evidence are not configured by that smaller identity-only stack. |
| Check local workflows immediately while AWS is blocked | Use the explicit fixture option below. It intentionally uses sample identities, with external AWS integrations disabled. |

Normal startup always uses Cognito and never silently switches to sample accounts:

```powershell
# Only after the identity-only stack has deployed and its actual outputs exist:
node scripts/configure-cognito.mjs .local/identity-outputs.json
npm run setup:local
npm run dev:local
```

Open **http://localhost:5173**. Keep the terminal open. The API listens on port 4000 and the private local database on 5432. Create your account through Cognito, verify your email, enroll an authenticator, then follow the first-admin bootstrap instructions. There are no shared administrator or responder passwords.

If you want an immediate local workflow check before AWS is available, explicitly run:

```powershell
npm run setup:demo
npm run dev:demo
```

At the entry screen choose **Open Development / Demo Mode**, select a role and choose **Continue with local account**. No fixture password is required. The labeled sample accounts are only for this fixture mode. Do not enable this mode on AWS. Stop the running app with Ctrl+C before switching modes; do not reuse an already running fixture server to evaluate real authentication.

## 4. Use the four roles

1. **Administrator:** bootstrap the first verified account; create jurisdictions, organizations, teams, qualifications and resources; invite authority/rescuer accounts with their exact scopes.
2. **Citizen:** public signup creates a citizen only. Report a clearly labeled test incident, provide coordinates/evidence, and follow its status.
3. **Authority:** acknowledge the incident, find eligible teams, offer an assignment, and authorize dispatch after acceptance.
4. **Rescuer:** start duty and location sharing; accept the assignment; progress through en route, arrived, in progress and completed. Keep location sharing open in its tab.

Use separate browser profiles for each account so cookies do not overwrite one another. The citizen and team must be inside the assigned jurisdiction and matching radius. GPS permission and an active location tab are required for fresh tracking. Maps and ETA require real Location configuration; the app reports unavailable/stale states instead of inventing them.

## 5. Verify the source on your computer

The integration suite resets only the isolated `response_test` database. Do not use your real-account or hosted database for tests. Prepare local fixtures and stop the development server before browser testing:

```powershell
npm run setup:demo
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run cloud:plan
npx tsx scripts/verify-infra.ts cdk.out/academic/DisasterResponse-academic.template.json
```

The normal tests no longer require Bash. Native Windows execution still needs verification on your PC; the release checks were executed on Linux. The optional legacy custom-domain deployment scripts use Bash; the hosted PowerShell guide does not use them.

VS Code **Terminal → Run Task** also provides setup, start, build, test, read-only AWS checks and template preview tasks. AWS deployment is an explicit terminal operation.

## 6. Common startup errors

| Error | Fix |
|---|---|
| WSL `/bin/bash` missing during setup | You are running an old download. Current `setup:local` runs `node scripts/local-setup.mjs`. Download this version and open the correct root folder. |
| `vitest`, `tsx`, or `playwright` not recognized | Run `npm ci` successfully in the folder containing the root `package.json`; do not install these globally. |
| Missing `.env.cognito` | Deploy/configure the real identity-only stack as documented. Do not rename `.env.demo` to `.env.cognito`. For hosted AWS deployment you do not need this local file. |
| Docker unavailable | Start Docker Desktop, select Linux containers, and wait for the engine to become ready. |
| `localhost` refused to connect | Start the correct development command and leave it running. Use port 5173, and read the terminal for the first error. |
| Port 5173/4000/5432 already used | Stop the older project process/container. Do not delete database volumes to fix a port conflict. |
| AWS explicit SCP deny | Resolve the organization policy with its administrator/AWS Support. Moving to your laptop does not override an account-level policy. |

The [redesign completion report](docs/REDESIGN_REPORT.md) explains the new dashboards, login fixes, verified workflows and remaining integrations.

## Where everything is

- `apps/web`: frontend, role consoles and maps.
- `apps/api`: authentication, authorization, incident workflows, tracking, provider adapters and jobs.
- `db/migrations`: schema, indexes, reference data and database safeguards.
- `infra/app.ts`: full cloud stack; `infra/identity.ts`: optional smaller identity-only stack.
- `scripts`: setup, deployment, migrations and administrator bootstrap.
- `tests`: domain, database integration and browser workflows.
- `docs/AWS_WINDOWS_DEPLOYMENT.md`: complete PowerShell cloud handoff, service checks and cleanup.
- `docs/IMPLEMENTATION_STATUS.md` and `docs/TESTING.md`: implemented features and actual validation evidence.

AWS account configuration, email/MFA enrollment, SMS registration and live acceptance cannot be included as completed work inside a source ZIP. No public application URL or pre-created privileged account is supplied.
