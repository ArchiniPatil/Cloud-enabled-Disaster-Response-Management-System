#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-preview}"
if [[ "$mode" != preview && "$mode" != deploy ]]; then printf 'Usage: bash scripts/deploy.sh preview|deploy\n'; exit 2; fi
if [ "$mode" = deploy ]; then
  node scripts/check-paid-deployment.mjs
fi
: "${AWS_REGION:=ap-south-1}"
: "${STAGE:=dev}"
: "${FRONTEND_ORIGIN:?Set the HTTPS frontend origin}"
: "${API_ORIGIN:?Set the HTTPS API origin}"
: "${API_CERTIFICATE_ARN:?Set the existing ACM certificate ARN}"
: "${BUDGET_EMAIL:?Set the budget alert email}"
aws sts get-caller-identity --region "$AWS_REGION" --query '{Account:Account,Arn:Arn}'
if [ ! -s certs/rds-global.pem ]; then printf 'Missing official RDS CA bundle. Run bash scripts/fetch-rds-ca.sh with network access.\n'; exit 1; fi
npm run lint
npm test
npm run build
args=(--app 'npx tsx infra/app.ts' -c "stage=$STAGE" --parameters "FrontendOrigin=$FRONTEND_ORIGIN" --parameters "ApiOrigin=$API_ORIGIN" --parameters "ApiCertificateArn=$API_CERTIFICATE_ARN" --parameters "BudgetEmail=$BUDGET_EMAIL")
if [ "$mode" = preview ]; then
  npx cdk synth --app 'npx tsx infra/app.ts' -c "stage=$STAGE" >/dev/null
  npx cdk diff --app 'npx tsx infra/app.ts' -c "stage=$STAGE" --no-change-set
else
  if [ "${APPROVE_BILLABLE_DEPLOYMENT:-}" != "I_REVIEWED_COSTS_AND_APPROVE" ]; then printf 'Explicit cost approval required: set APPROVE_BILLABLE_DEPLOYMENT=I_REVIEWED_COSTS_AND_APPROVE after review.\n'; exit 1; fi
  npx cdk deploy "${args[@]}" --require-approval broadening
fi
