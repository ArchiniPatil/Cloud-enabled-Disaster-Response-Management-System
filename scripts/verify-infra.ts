import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const template = JSON.parse(
  readFileSync(
    process.argv[2] ?? "cdk.out/DisasterResponse-dev.template.json",
    "utf8",
  ),
);
const resources = Object.values(template.Resources) as {
  Type: string;
  Properties: Record<string, any>;
  DeletionPolicy?: string;
}[];
const of = (type: string) => resources.filter((r) => r.Type === type);
assert.equal(of("AWS::RDS::DBInstance").length, 1);
const db = of("AWS::RDS::DBInstance")[0];
assert.equal(db.Properties.PubliclyAccessible, false);
assert.equal(db.Properties.StorageEncrypted, true);
assert.equal(db.Properties.DeletionProtection, true);
assert.equal(db.DeletionPolicy, "Retain");
assert(
  of("AWS::S3::Bucket").every(
    (b) =>
      b.Properties.PublicAccessBlockConfiguration?.BlockPublicAcls === true,
  ),
);
const identity = of("AWS::Cognito::UserPool")[0];
assert.equal(identity.Properties.MfaConfiguration, "ON");
assert(
  of("AWS::SQS::Queue").some(
    (q) => q.Properties.RedrivePolicy?.maxReceiveCount === 5,
  ),
);
assert(
  of("AWS::Scheduler::Schedule").some(
    (s) => s.Properties.ScheduleExpression === "rate(1 minute)",
  ),
);
assert(
  of("AWS::ECS::Service").every(
    (s) =>
      s.Properties.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp ===
      "DISABLED",
  ),
);
if (of("AWS::ApiGatewayV2::Api").length) {
  assert(
    of("AWS::ElasticLoadBalancingV2::LoadBalancer").every(
      (l) => l.Properties.Scheme === "internal",
    ),
  );
  assert(
    of("AWS::ApiGatewayV2::Integration").every(
      (i) => i.Properties.ConnectionType === "VPC_LINK",
    ),
  );
  assert.equal(of("AWS::ApiGatewayV2::VpcLink").length, 1);
  assert(!template.Parameters?.ApiCertificateArn);
  assert(!template.Parameters?.FrontendOrigin);
} else
  assert(
    of("AWS::ElasticLoadBalancingV2::Listener").some(
      (l) => l.Properties.Protocol === "HTTPS",
    ),
  );
assert(resources.some((r) => r.Type === "AWS::CloudFormation::CustomResource"));
assert(of("AWS::Budgets::Budget").length === 1);
for (const o of Object.values(template.Outputs ?? {}) as any[])
  assert(!/SecretString|password|access.key/i.test(JSON.stringify(o.Value)));
console.log(
  "Infrastructure assertions passed: private encrypted DB, retained data, MFA, queue redrive, durable schedule, private tasks, HTTPS ingress or private API Gateway integration, migrations, budget and no secret-value outputs.",
);
