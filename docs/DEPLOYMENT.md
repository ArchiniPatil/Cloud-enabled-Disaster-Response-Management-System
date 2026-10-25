# Deployment procedure

## Current Windows handoff

Use [AWS_WINDOWS_DEPLOYMENT.md](AWS_WINDOWS_DEPLOYMENT.md) for the complete default-hostname hosted deployment from PowerShell, real account bootstrap, frontend publication, optional pipeline, service verification and cleanup. It supersedes older missing-credential instructions. AWS identity and Free-plan credits were verified on 25 October 2026; CloudFormation remains blocked by an explicit Organizations SCP deny. No application resources have been provisioned.

The user will perform deployment personally. The scoped credit-funded plan remains 24 hours / $30 credits, $0 cash and no upgrade/domain/SMS activation. The account-level policy must still be resolved on the laptop. `config/academic-deployment.json` and the `cloud:*` commands apply to this default-hostname option.

## Custom-domain reference deployment

The remaining instructions describe the separate paid `DisasterResponse-dev` / `DisasterResponse-prod` reference. They are not the PowerShell academic path. Its policy remains disabled in `config/deployment-policy.json`; do not run its cleanup script against the academic stack. The following commands require Bash and an existing domain/certificate.

## Preflight

1. Use Node 22+, Docker, AWS CLI, and an authenticated least-privilege deployment role. Choose `AWS_REGION=ap-south-1`, `STAGE=dev` or `prod`.
2. Check caller identity, applicable Organizations/SCP restrictions, RDS/Fargate/Lambda/Location quotas and regional functionality. Inspect existing stacks; never replace a resource outside this stack.
3. Prepare an existing HTTPS domain and ACM certificate in Mumbai. **Domain purchase is not automated.** Use frontend and API names under the same registrable domain (for example, `app.<your-domain>` and `api.<your-domain>`). Verify ownership, DNS, Cognito callback cookies and Amplify proxy behavior.
4. Set nonsecret shell variables: `FRONTEND_ORIGIN`, `API_ORIGIN`, `API_CERTIFICATE_ARN`, `BUDGET_EMAIL`. Do not put database passwords or AWS keys into frontend build variables.
5. `bash scripts/fetch-rds-ca.sh` obtains and validates the official AWS RDS CA bundle. No disabled TLS verification is supported.
6. Run local verification. `npm run infra:check` synthesizes the base stack and checks critical security properties. Optional variants: `npm run infra:synth -- -c analytics=true -c pipeline=true --quiet`. Pipeline synthesis requires no connection value until deployment; actual deployment requires an approved CodeConnections ARN.
7. Activate the `Project` cost-allocation tag in Billing if needed. The $200 development / $350 production budget is an alert, not a hard cap. Confirm the email subscription. Costs can begin before an alert is sent.

## Preview and deploy

```sh
aws sts get-caller-identity --region ap-south-1
npm run infra:check
bash scripts/deploy.sh preview
```

The preview uses `cdk diff --no-change-set` to avoid creating a change set. Missing AWS access is a blocker for account comparison, not for local synthesis. CDK bootstrap creates billable/support resources and requires separate approval if the account/region is not bootstrapped.

Only after the user changes the $0 requirement, reviews a nonzero cost estimate and explicitly approves both the policy change and provisioning:

```sh
export APPROVE_BILLABLE_DEPLOYMENT=I_REVIEWED_COSTS_AND_APPROVE
bash scripts/deploy.sh deploy
```

The script rechecks identity, verifies the CA exists, runs lint/tests/build and invokes CDK with IAM broadening approval. This authorization variable is a deliberate operator safeguard, not a secret.

Initial deployment publishes a Docker asset to CDK's bootstrap ECR and provisions infrastructure. A dedicated migration Lambda creates extensions/schema/reference data and configures the limited runtime role before ECS service creation. Subsequent SQL migrations must be additive/backward-compatible with currently running tasks. Review migration effects before deployment; automatic schema rollback is not performed.

Set DNS for the API to the output load balancer and attach the verified custom frontend domain to Amplify. The CDK Amplify app has a development/production branch and rewrite rules; connect an approved repository or upload the built `apps/web/dist` artifact through Amplify's supported manual deployment flow. Do not put a GitHub token in CDK context. The optional backend pipeline uses a preauthorized CodeConnections ARN and has manual approval before ECS deployment; it does not automatically deploy production or trigger on every push.

## First administrator

Register the intended admin identity through Cognito and complete email verification/TOTP. Using an approved deployment/operations principal with permission to invoke **only the administrative migration function**, invoke its `bootstrap-admin` action. There is no public HTTP bootstrap route and the action refuses after an admin exists.

```sh
# Read actual output from your deployed stack, not a fabricated name.
aws cloudformation describe-stacks --stack-name DisasterResponse-dev \
  --region ap-south-1 --query 'Stacks[0].Outputs'
# Create an ignored local payload containing the existing Cognito username:
mkdir -p .local
# .local/bootstrap.json: {"action":"bootstrap-admin","username":"<verified Cognito username>"}
aws lambda invoke --region ap-south-1 --function-name "$MIGRATION_FUNCTION_NAME" \
  --payload fileb://.local/bootstrap.json .local/bootstrap-result.json
```

Inspect `FunctionError` and the result without publishing identity information. The function checks Cognito identity/MFA and locks the bootstrap transaction. Restrict future invocation permissions. An alternative operator CLI exists: `npm run bootstrap:admin -- <username>`, usable only through an approved private database connection and Cognito configuration.

Admin must create operating jurisdictions, teams and accounts and review the demonstration category/policy defaults. Do not run `db:seed` in production.

## Deployment verification

Use the real configured origins:

```sh
curl --fail "$API_ORIGIN/api/v1/health/ready"
aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region ap-south-1
aws logs tail "$API_LOG_GROUP" --since 10m --region ap-south-1
```

Then test real Cognito registration/verification/MFA/login/refresh/logout, authority scope, private evidence finalization/download, Location map/routing, SQS retries/DLQ, worker restart/escalation, cookies and SSE through Amplify, account suspension and failed-provider behavior. Verify metrics/alarms and a database restore. Never send uncontrolled alerts to real responders. No live AWS integration result is claimed until these steps actually execute.

## Rollback and cleanup

ECS deployment circuit breaker rolls back unhealthy task deployments. For application rollback, redeploy the previous tested image/task definition; retain backward-compatible database schema. Restore data into a **new** private database instance for recovery; never overwrite the live database without approved procedure. See operations.

```sh
# Review resources and backups first. Destructive confirmation required.
CONFIRM_DESTROY=DELETE_REVIEWED_DEV_STACK STAGE=dev bash scripts/cleanup.sh
```

This deliberately retains RDS, S3, Cognito, ECR and logs. Review retained resources, snapshots, NAT/EIP, ALB, Amplify builds, and CDK bootstrap artifacts separately. Retained resources continue to incur charges. Production destruction is blocked by the helper.
