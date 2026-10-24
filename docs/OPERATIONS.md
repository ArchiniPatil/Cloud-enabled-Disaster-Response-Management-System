# Operations and recovery

## Local operations

```sh
npm run setup:local
npm run dev:local
curl --fail http://127.0.0.1:4000/api/v1/health/ready
docker compose logs --tail=100 db
# Stop local application with Ctrl-C; stop database without deleting its volume:
docker compose stop db
```

The Docker volume retains PostgreSQL state. Live processes do not survive cloud-environment publication/restoration; restart through the saved startup instructions. Do not create an extra Git worktree for ordinary tasks in this already isolated environment.

## Monitoring

CloudWatch definitions cover API 5xx, worker errors, queue age, DLQ messages and database CPU, with a dashboard and log retention. Notification errors emit a custom metric. Subscribe/confirm the operations email. The admin health API reports outbox backlog, overdue escalation count, notification failures, and integration configuration. Inspect actual logs and metrics: a running PID or open port is insufficient readiness evidence.

```sh
aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region ap-south-1
aws logs tail "$API_LOG_GROUP" --follow --region ap-south-1
aws cloudwatch describe-alarms --state-value ALARM --region ap-south-1
aws sqs get-queue-attributes --queue-url "$DLQ_URL" \
  --attribute-names ApproximateNumberOfMessages --region ap-south-1
```

Do not put report descriptions, phone numbers, tokens, signed URLs or GPS into incident tickets/logs unnecessarily. Use request/event IDs.

## Queue and escalation failures

Outbox rows remain pending until publication succeeds; backoff is bounded to five minutes. Consumer UUIDs deduplicate replay. SQS visibility is six minutes, Lambda timeout 50 seconds, redrive after five receives. Partial-batch failure returns only failing message IDs. Resolve the underlying error before approved DLQ redrive; do not clear queues to silence alarms.

A scheduled worker reads overdue database deadlines after a restart. Escalation is not lost when Express exits. Check worker errors, DB connectivity, permissions, locks and overdue rows. Scheduler frequency adds latency; establish an operational SLA before real deployment. `REGIONAL_REVIEW_REQUIRED` requires human control-room action. It does not mean an external regional center has received the incident.

Direct SMS remains disabled. Provider acceptance is `SUBMITTED`, not delivery/read/acceptance. Ambiguous network outcomes are `UNKNOWN` and never automatically resent. Definitive failures can be requeued through the admin API, capped at three sends. Delivery-receipt ingestion and SMS activation are outstanding; do not label a message `DELIVERED` manually without verified provider evidence.

## Database backup / restore

RDS automated backups retain seven days in development and fourteen in production; production defines Multi-AZ. These are configured intentions, not tested recovery outcomes. Deletion protection and retention are enabled.

For a restore drill, record the source instance, recovery timestamp, encryption key and application schema version. Restore to a **new private instance**, keep production isolated, run migrations only if compatible, validate record counts/audit/foreign keys, run the smoke workflow, then measure RPO/RTO. Point a separate test service at the restored secret. Switching production requires explicit approval and rollback planning.

Example (after approval; fill verified IDs/security groups/subnet group):

```sh
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier "$SOURCE_DB" \
  --target-db-instance-identifier "$RESTORE_DB" --use-latest-restorable-time \
  --db-subnet-group-name "$ISOLATED_SUBNET_GROUP" \
  --vpc-security-group-ids "$RESTORE_SECURITY_GROUP" --no-publicly-accessible \
  --region ap-south-1
```

Local backup example: `docker compose exec -T db pg_dump -U response -Fc response > .local/response.dump`. This file contains personal/incident data; keep it private and ignored. Restore only into a separate named test database. No automated destructive overwrite helper is supplied.

## Privacy and retention

Coordinates expire after configurable 24 hours by default, and inactive sessions cannot supply live tracking. GPS is stale after 90 seconds or poor accuracy. Team candidate search uses at most five-minute-old operational coordinates. Evidence lifecycle expires current S3 objects after 90 days and noncurrent versions after 30 days. Metadata may remain after object expiry. Pending uploads, malformed images and expired objects require operator review; malware/EXIF scanning is not implemented.

Incidents/audit/notifications do not have automatic destructive retention in this version. Choose a legally reviewed retention/export policy before real personal data. The optional analytics export contains aggregate category/severity/status counts and age, no personal text/identity/coordinates. It is not a complete operational response-time or utilization BI system.

## Session/account recovery

Suspension increments session version, deletes sessions, stops location sharing, and attempts Cognito disable/global-sign-out. If Cognito synchronization fails, application authorization is still revoked; retry provider synchronization under operator control. Rotating the session encryption key requires sign-in again unless tokens are safely re-encrypted. Do not unlock or promote an admin through a public endpoint; use approved account recovery and recorded database/identity administration.

## Deployment rollback / cleanup

Use the previous tested immutable image/task definition for application rollback. Do not reverse a schema migration blindly. ECS circuit breaker handles failed task health. Follow `DEPLOYMENT.md` for guarded cleanup. Retained RDS, snapshots, buckets, identity pools, logs, ECR and bootstrap assets can keep billing after stack deletion; inspect individually and obtain approval before data destruction.
