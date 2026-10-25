# AWS service responsibilities and deployment status

Every resource below is **defined but not provisioned** unless explicitly marked as a future integration. `ap-south-1` is the target; account permissions, quotas, current regional features and provider terms remain deployment preflight checks.

| Service | Implemented responsibility | Important qualification |
|---|---|---|
| Amplify Hosting | React build specification, app and branch, same-origin API rewrites | Source connection/manual upload and domain validation required; automatic source deployments off |
| ECS Fargate + ALB | Private Express tasks, HTTPS listener, health checks, scaling limit, deployment rollback | Custom-domain reference needs ACM/domains; academic stack uses API Gateway HTTPS and an internal HTTP ALB |
| ECR | Immutable image repository, scan on push, retention | Initial CDK asset uses bootstrap ECR; optional pipeline uses project ECR |
| RDS PostgreSQL / PostGIS | Encrypted isolated DB, backups, TLS, private security groups | Migration custom resource creates PostGIS/schema/runtime role; unverified on live RDS |
| Cognito | Unified managed login, public citizen registration, invitation API, TOTP, PKCE | Email setup, recovery and actual account flows unverified |
| S3 | Private evidence, signed POST/download, retention, encryption | Finalized file copying and permissions require live test |
| SNS | Incident topic and real Publish adapter | SMS adapter exists but disabled; no real messages sent |
| SQS | Event queue, five-attempt redrive, 14-day DLQ | Local tests exercise consumer idempotence, not real queues |
| Lambda | Partial-batch event handler, bounded scheduled worker, privileged migration function | Concurrency capped; error/backlog alarms |
| EventBridge Scheduler | One-minute durable-deadline polling | Not a sub-minute guaranteed scheduler; state is in PostgreSQL |
| Amazon Location | Signed map proxy and route calculation with 60-second cache | Esri map/route data source; validate Mumbai support, terms and pricing |
| API Gateway WebSockets | Not created | Custom-domain reference uses authenticated SSE; academic gateway uses authorized five-second polling; trade-offs documented in architecture |
| Secrets Manager | Owner/runtime DB credentials and session encryption key | No secrets in outputs; runtime receives only necessary secrets |
| CloudWatch | JSON logs, retention, alarms, dashboard, failure metric | Confirm notification-email subscription and test alarms |
| Budgets | Tagged monthly budget and email threshold | Alerts are not hard spend caps; tag activation may be necessary |
| CodeBuild / CodePipeline | Optional Git connection → verification → ECR → explicit approval → ECS | Enabled with `-c pipeline=true`; existing connection required |
| S3 / Glue / Athena | Optional daily category/severity/status aggregate export and catalog | Enabled with `-c analytics=true`; three datasets include response intervals/escalation, team workload and inventory; incident geography is not exported |

## SMS activation checklist (not yet executed)

1. Check AWS End User Messaging/SNS SMS support and quotas for the chosen account/region and recipient countries.
2. Confirm SMS sandbox status and use verified test numbers. India generally requires applicable DLT entity, sender and template registrations. Verify current requirements with AWS documentation before sending.
3. Review actual per-message/carrier pricing, permitted templates, consent and an explicit account spend limit.
4. Configure delivery-status logging/receipts and a narrowly governed sender role. Direct phone-number `sns:Publish` requires IAM treatment different from a topic ARN; the shipped worker role intentionally has no direct-SMS wildcard grant.
5. Configure the implemented allowlisted CloudWatch-to-Lambda receipt subscriptions using reviewed SNS delivery log groups. Submission states are `SUBMITTED`, `FAILED` or `UNKNOWN`; only an actual provider receipt can set `DELIVERED`. Sender/entity/template attributes required by your registration still need explicit adapter configuration; see the Windows guide.
6. Enable `SMS_ENABLED=true` only after approval and verified recipient configuration. Unknown outcomes are not automatically resent; reconcile them first. Definite failures can be retried explicitly, with a three-attempt cap and per-recipient rate cap.

Official references: [SNS SMS](https://docs.aws.amazon.com/sns/latest/dg/sns-mobile-phone-number-as-subscriber.html), [India registration](https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-sms-senderid-india.html), [Amazon Location](https://docs.aws.amazon.com/location/latest/developerguide/what-is.html). Access to current documentation/pricing was network-denied during this session; requirements must be reconfirmed before provisioning or sending.

## Academic variants

The default-hostname academic template adds API Gateway HTTP API and VPC Link to the private ALB and uses Amplify's default hostname. Amazon Location includes an authenticated place-index search proxy as well as maps/routes. Optional CloudWatch SNS delivery subscriptions invoke a dedicated receipt Lambda. Glue/Athena describe incident, team and resource aggregate datasets. A separate identity-only template uses Cognito Lite with email/TOTP and no SMS. These are synthesized definitions; none has been provisioned or live-validated.

For copyable PowerShell steps and a service-by-service acceptance table, see [AWS_WINDOWS_DEPLOYMENT.md](AWS_WINDOWS_DEPLOYMENT.md).
