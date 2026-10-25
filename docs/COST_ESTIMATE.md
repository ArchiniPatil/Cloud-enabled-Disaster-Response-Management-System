# Cost policy and reference architecture estimate

**Active cash budget: $0.** User reports a Free plan with $120 credits and 169 days remaining. The separate proposed one-day academic window and $30 credit allowance are documented in [ACADEMIC_DEMO.md](ACADEMIC_DEMO.md); they are not yet approved or verified against live prices. Development/evaluation uses local Docker/PostGIS and localhost URLs. No AWS resources have been created. No domain purchase is required. The deployment policy blocks the paid reference stack. Free Tier credits, eligibility and limits are account-specific and do not guarantee a $0 ongoing bill; Fargate, ALB, NAT and managed PostGIS/RDS cannot all be assumed always-free.

The estimates below describe a future paid reference deployment only. They are not the selected plan or authorized spend.

Target: ap-south-1, 730 hours/month, one development API task (0.25 vCPU / 0.5 GiB), one small single-AZ PostgreSQL instance with 20 GiB storage, one NAT gateway, one public ALB across two AZs, low academic-project traffic. No Free Tier credit is assumed. Prices, taxes, exchange rates and account eligibility vary.

**Reserve approximately US$120–200/month for the development base stack**, excluding SMS, heavy egress, domains and optional CI/analytics. A production configuration should initially reserve **US$220–400+/month**, with substantially higher costs possible under traffic/load. These are conservative estimates from service cost structure, not retrieved current Mumbai rates.

Attempts to read AWS's current regional price lists were blocked by the environment's network policy. The required domain has been added to the saved network draft; exact prices and availability remain an explicit pre-provisioning requirement. Do not treat these ranges as an approved budget or deploy on their basis without review.

| Resource | Development monthly allowance (USD) | Main drivers |
|---|---:|---|
| Fargate API | 10–18 | 730h × (0.25 × vCPU-hour price + 0.5 × GB-hour price); doubles at max dev scale |
| RDS + 20 GiB | 20–40 | Instance hours, GP3/storage, CPU credits, backup excess; autoscaling up to 100 GiB |
| NAT gateway | 35–55+ | Hourly charge plus per-GB processing; often the largest fixed cost |
| ALB | 20–30+ | Hours and capacity units; SSE connections contribute |
| Public IPv4 | 10–15 | Typical two ALB addresses and NAT address; verify current metering |
| CloudWatch | 5–20+ | Logs, dashboard, custom metric, alarms and container insights |
| Secrets Manager | 1–3 | Three secrets and API calls |
| S3, SNS/SQS, Lambda, Scheduler | 1–10+ | Stored objects, events, periodic worker invocations and execution duration |
| Amplify, Cognito, Location | 0–20+ | Build minutes, hosting/transfer, MAUs, maps and routes; do not assume allowances |
| Optional CodeBuild/CodePipeline | usage dependent | Build minutes, pipeline type, Docker layers, ECR storage |
| Optional analytics | usage dependent | S3 retained data, Glue catalog, Athena bytes scanned |
| SMS | excluded | Country/carrier, sender registration, templates, retries; no messages enabled |
| Domain / taxes / data egress | excluded | Existing domain assumed; purchases need separate approval |

Ranges overlap and actual total is usage-dependent. Confirm each rate using the AWS Pricing Calculator and current regional pricing before approval. Example official price-list endpoints:

- `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-south-1/index.json`
- `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-south-1/index.json`
- `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/ap-south-1/index.json`

Cost controls in code: dev tasks 1–2, prod 2–4, Lambda worker concurrency 2, one NAT, 30-day logs, immutable ECR images with retention, S3 evidence lifecycle, analytics query scan cap of 1 GB, tagged budget notifications, SMS off, pipeline/analytics off by default. These controls **do not guarantee a spend ceiling**. Failed/deleting stacks and retained data can still bill.

For a classroom demonstration, run locally until the approved cloud demo window. Tear down stateless billable resources afterwards with the guarded procedure; review retained data explicitly. Do not stop a database or delete resources belonging to another project.
