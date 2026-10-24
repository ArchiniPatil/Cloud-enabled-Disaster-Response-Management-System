#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${STAGE:=dev}"
if [ "$STAGE" != dev ]; then printf 'Production cleanup is intentionally unsupported. Follow the reviewed recovery runbook.\n'; exit 1; fi
aws sts get-caller-identity --region "${AWS_REGION:-ap-south-1}" --query '{Account:Account,Arn:Arn}'
if [ "${CONFIRM_DESTROY:-}" != 'DELETE_REVIEWED_DEV_STACK' ]; then printf 'Inspect stack resources and backups first. Set CONFIRM_DESTROY=DELETE_REVIEWED_DEV_STACK only after explicit approval.\n'; exit 1; fi
npx cdk destroy --app 'npx tsx infra/app.ts' -c stage=dev
printf 'Database, buckets, identity pool, logs and ECR may be retained and continue billing. Review them individually; no automated data deletion is performed.\n'
