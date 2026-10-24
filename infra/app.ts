import {
  App,
  Stack,
  Duration,
  RemovalPolicy,
  Tags,
  CfnOutput,
  CfnParameter,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as patterns,
  aws_ecr as ecr,
  aws_rds as rds,
  aws_s3 as s3,
  aws_cognito as cognito,
  aws_sns as sns,
  aws_sqs as sqs,
  aws_sns_subscriptions as subscriptions,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_lambda_event_sources as sources,
  aws_iam as iam,
  aws_secretsmanager as secrets,
  aws_logs as logs,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as cwActions,
  aws_certificatemanager as acm,
  aws_scheduler as scheduler,
  aws_location as location,
  aws_amplify as amplify,
  aws_glue as glue,
  aws_athena as athena,
  aws_codebuild as codebuild,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as actions,
  aws_budgets as budgets,
  aws_elasticloadbalancingv2 as elbv2,
  custom_resources as custom,
  CustomResource,
  CfnResource,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
export class ResponseStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      env: {
        region: process.env.CDK_DEFAULT_REGION ?? "ap-south-1",
        account: process.env.CDK_DEFAULT_ACCOUNT,
      },
    });
    const stage = this.node.tryGetContext("stage") ?? "dev";
    if (!["dev", "prod"].includes(stage))
      throw new Error("stage must be dev or prod");
    const prod = stage === "prod";
    Tags.of(this).add("Project", "DisasterResponse");
    Tags.of(this).add("Environment", stage);
    Tags.of(this).add("ManagedBy", "CDK");
    const frontend = new CfnParameter(this, "FrontendOrigin", {
      description:
        "HTTPS origin of Amplify custom domain; must share a registrable domain with the API",
      allowedPattern: "https://[^/]+",
      type: "String",
    });
    const apiOrigin = new CfnParameter(this, "ApiOrigin", {
      description: "HTTPS API origin on your domain",
      allowedPattern: "https://[^/]+",
      type: "String",
    });
    const certificate = new CfnParameter(this, "ApiCertificateArn", {
      description: "Existing ACM certificate ARN in this region",
      type: "String",
      allowedPattern: "arn:aws:acm:.*",
    });
    const budgetEmail = new CfnParameter(this, "BudgetEmail", {
      type: "String",
      description:
        "Verified operations email for budget alerts; no SMS destination",
    });
    const vpc = new ec2.Vpc(this, "Network", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "Application",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "Database",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });
    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    const db = new rds.DatabaseInstance(this, "Database", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        prod ? ec2.InstanceSize.SMALL : ec2.InstanceSize.MICRO,
      ),
      databaseName: "response",
      credentials: rds.Credentials.fromGeneratedSecret("response_admin"),
      storageEncrypted: true,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      multiAz: prod,
      publiclyAccessible: false,
      backupRetention: Duration.days(prod ? 14 : 7),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cloudwatchLogsExports: ["postgresql"],
      autoMinorVersionUpgrade: true,
      parameterGroup: new rds.ParameterGroup(this, "DBParameters", {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_16,
        }),
        parameters: { "rds.force_ssl": "1" },
      }),
    });
    const appDatabaseSecret = new secrets.Secret(
      this,
      "ApplicationDatabaseCredentials",
      {
        generateSecretString: {
          secretStringTemplate: Stack.of(this).toJsonString({
            username: "response_app",
            host: db.dbInstanceEndpointAddress,
            port: 5432,
            dbname: "response",
          }),
          generateStringKey: "password",
          passwordLength: 40,
          excludePunctuation: true,
        },
      },
    );
    const sessionSecret = new secrets.Secret(this, "SessionEncryptionKey", {
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
    const evidence = new s3.Bucket(this, "Evidence", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedOrigins: [frontend.valueAsString],
          allowedMethods: [s3.HttpMethods.POST],
          allowedHeaders: ["*"],
          maxAge: 300,
        },
      ],
      lifecycleRules: [
        {
          id: "Retention",
          expiration: Duration.days(90),
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });
    const pool = new cognito.UserPool(this, "Identity", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const client = pool.addClient("WebClient", {
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [`${frontend.valueAsString}/api/v1/auth/callback`],
        logoutUrls: [frontend.valueAsString],
      },
      accessTokenValidity: Duration.minutes(15),
      idTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(7),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    });
    const domain = pool.addDomain("HostedLogin", {
      cognitoDomain: { domainPrefix: `response-${this.account}-${stage}` },
    });
    const eventTopic = new sns.Topic(this, "IncidentEvents", {
      enforceSSL: true,
    });
    const dlq = new sqs.Queue(this, "DeadLetters", {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    const queue = new sqs.Queue(this, "EventQueue", {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.minutes(6),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
      enforceSSL: true,
    });
    eventTopic.addSubscription(
      new subscriptions.SqsSubscription(queue, { rawMessageDelivery: true }),
    );
    const map = new location.CfnMap(this, "Map", {
      mapName: `response-${stage}`,
      configuration: { style: "VectorEsriNavigation" },
      description: "Authorized operational map",
    });
    const route = new location.CfnRouteCalculator(this, "Routes", {
      calculatorName: `response-${stage}`,
      dataSource: "Esri",
    });
    const environment: Record<string, string> = {
      NODE_ENV: "production",
      AUTH_MODE: "cognito",
      AWS_REGION: this.region,
      PORT: "4000",
      APP_ORIGIN: frontend.valueAsString,
      API_ORIGIN: apiOrigin.valueAsString,
      DATABASE_SECRET_ARN: appDatabaseSecret.secretArn,
      SESSION_SECRET_ARN: sessionSecret.secretArn,
      COGNITO_POOL_ID: pool.userPoolId,
      COGNITO_CLIENT_ID: client.userPoolClientId,
      COGNITO_DOMAIN: domain.baseUrl(),
      EVIDENCE_BUCKET: evidence.bucketName,
      EVENT_TOPIC_ARN: eventTopic.topicArn,
      LOCATION_MAP_NAME: map.ref,
      LOCATION_ROUTE_CALCULATOR: route.ref,
      SMS_ENABLED: "false",
      LOCATION_RETENTION_HOURS: "24",
      NODE_EXTRA_CA_CERTS: "/app/certs/rds-global.pem",
    };
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });
    const taskLog = new logs.LogGroup(this, "ApiLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const service = new patterns.ApplicationLoadBalancedFargateService(
      this,
      "Api",
      {
        cluster,
        cpu: 256,
        memoryLimitMiB: 512,
        desiredCount: prod ? 2 : 1,
        publicLoadBalancer: true,
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        assignPublicIp: false,
        certificate: acm.Certificate.fromCertificateArn(
          this,
          "Certificate",
          certificate.valueAsString,
        ),
        redirectHTTP: true,
        listenerPort: 443,
        healthCheckGracePeriod: Duration.seconds(90),
        circuitBreaker: { rollback: true },
        taskImageOptions: {
          image: ecs.ContainerImage.fromAsset(path.resolve("."), {
            file: "Dockerfile",
          }),
          containerPort: 4000,
          environment,
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: "api",
            logGroup: taskLog,
          }),
          containerName: "api",
        },
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
      },
    );
    service.targetGroup.configureHealthCheck({
      path: "/api/v1/health/ready",
      healthyHttpCodes: "200",
    });
    service.targetGroup.setAttribute(
      "deregistration_delay.timeout_seconds",
      "30",
    );
    service.service
      .autoScaleTaskCount({
        minCapacity: prod ? 2 : 1,
        maxCapacity: prod ? 4 : 2,
      })
      .scaleOnCpuUtilization("CpuScaling", { targetUtilizationPercent: 65 });
    db.connections.allowDefaultPortFrom(service.service);
    const workerEnvironment = { ...environment };
    delete workerEnvironment.AWS_REGION;
    workerEnvironment.NODE_EXTRA_CA_CERTS = "/var/task/certs/rds-global.pem";
    const worker = new nodejs.NodejsFunction(this, "Worker", {
      entry: "apps/api/src/lambda.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: Duration.seconds(50),
      reservedConcurrentExecutions: 2,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: workerEnvironment,
      logGroup: new logs.LogGroup(this, "WorkerLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        externalModules: ["pg-native"],
        banner:
          "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_input, output) => [
            `mkdir -p '${output}/certs'`,
            `if [ -f certs/rds-global.pem ]; then cp certs/rds-global.pem '${output}/certs/rds-global.pem'; fi`,
          ],
        },
      },
    });
    const migrationEnvironment = {
      ...workerEnvironment,
      DATABASE_SECRET_ARN: db.secret!.secretArn,
      APP_DB_SECRET_ARN: appDatabaseSecret.secretArn,
    };
    const migrator = new nodejs.NodejsFunction(this, "DatabaseMigrator", {
      entry: "scripts/migration-handler.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.minutes(3),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: migrationEnvironment,
      logGroup: new logs.LogGroup(this, "MigrationLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        externalModules: ["pg-native"],
        banner:
          "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_input, output) => [
            `mkdir -p '${output}/certs'`,
            `if [ -f certs/rds-global.pem ]; then cp certs/rds-global.pem '${output}/certs/rds-global.pem'; fi`,
            `cp -R db '${output}/db'`,
            `chmod -R a+rX '${output}'`,
          ],
        },
      },
    });
    db.connections.allowDefaultPortFrom(migrator);
    db.secret!.grantRead(migrator);
    migrator.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminGetUser"],
        resources: [pool.userPoolArn],
      }),
    );
    new CfnOutput(this, "MigrationFunctionName", {
      value: migrator.functionName,
    });
    appDatabaseSecret.grantRead(migrator);
    sessionSecret.grantRead(migrator);
    const migrationProvider = new custom.Provider(this, "MigrationProvider", {
      onEventHandler: migrator,
    });
    const migrations = new CustomResource(this, "SchemaMigration", {
      serviceToken: migrationProvider.serviceToken,
      properties: {
        Revision: createHash("sha256")
          .update(
            readdirSync("db/migrations")
              .sort()
              .map((n) => readFileSync(`db/migrations/${n}`))
              .join(""),
          )
          .digest("hex"),
      },
    });
    migrations.node.addDependency(db);
    (service.service.node.defaultChild as ecs.CfnService).addResourceDependency(
      migrations.node.defaultChild as CfnResource,
    );
    db.connections.allowDefaultPortFrom(worker);
    worker.addEventSource(
      new sources.SqsEventSource(queue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );
    const scheduleRole = new iam.Role(this, "ScheduleRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    worker.grantInvoke(scheduleRole);
    new scheduler.CfnSchedule(this, "EscalationTick", {
      scheduleExpression: "rate(1 minute)",
      flexibleTimeWindow: { mode: "OFF" },
      target: {
        arn: worker.functionArn,
        roleArn: scheduleRole.roleArn,
        input: "{}",
        retryPolicy: { maximumRetryAttempts: 3, maximumEventAgeInSeconds: 300 },
        deadLetterConfig: { arn: dlq.queueArn },
      },
    });
    dlq.grantSendMessages(scheduleRole);
    for (const principal of [service.taskDefinition.taskRole, worker]) {
      appDatabaseSecret.grantRead(principal);
      sessionSecret.grantRead(principal);
      eventTopic.grantPublish(principal);
      evidence.grantReadWrite(principal);
    }
    service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminUserGlobalSignOut",
        ],
        resources: [pool.userPoolArn],
      }),
    );
    service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "geo:GetMapStyleDescriptor",
          "geo:GetMapTile",
          "geo:GetMapGlyphs",
          "geo:GetMapSprites",
        ],
        resources: [map.attrArn],
      }),
    );
    service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["geo:CalculateRoute"],
        resources: [route.attrArn],
      }),
    );
    // Direct SMS remains disabled: enable only after regulatory, sandbox and spend-limit review.
    const alarmsTopic = new sns.Topic(this, "OperationalAlerts");
    const alarms = [
      new cw.Alarm(this, "QueueBacklog", {
        metric: queue.metricApproximateAgeOfOldestMessage(),
        threshold: 120,
        evaluationPeriods: 2,
      }),
      new cw.Alarm(this, "DeadLettersAlarm", {
        metric: dlq.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
      }),
      new cw.Alarm(this, "WorkerErrors", {
        metric: worker.metricErrors(),
        threshold: 1,
        evaluationPeriods: 1,
      }),
      new cw.Alarm(this, "DatabaseCpu", {
        metric: db.metricCPUUtilization(),
        threshold: 80,
        evaluationPeriods: 3,
      }),
      new cw.Alarm(this, "ApiErrors", {
        metric: service.loadBalancer.metrics.httpCodeTarget(
          elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
        ),
        threshold: 5,
        evaluationPeriods: 2,
      }),
    ];
    for (const alarm of alarms)
      alarm.addAlarmAction(new cwActions.SnsAction(alarmsTopic));
    alarmsTopic.addSubscription(
      new subscriptions.EmailSubscription(budgetEmail.valueAsString),
    );
    const dashboard = new cw.Dashboard(this, "OperationsDashboard", {
      dashboardName: `response-${stage}`,
    });
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "Queue and worker",
        left: [
          queue.metricApproximateNumberOfMessagesVisible(),
          worker.metricErrors(),
        ],
      }),
      new cw.GraphWidget({
        title: "API and database",
        left: [
          service.service.metricCpuUtilization(),
          db.metricCPUUtilization(),
        ],
      }),
    );
    new logs.MetricFilter(this, "NotificationFailureMetric", {
      logGroup: logs.LogGroup.fromLogGroupName(
        this,
        "WorkerLogRef",
        `/aws/lambda/${worker.functionName}`,
      ),
      filterPattern: logs.FilterPattern.stringValue(
        "$.event",
        "=",
        "notification_failed",
      ),
      metricNamespace: "Response",
      metricName: "NotificationFailures",
      metricValue: "1",
    });
    new budgets.CfnBudget(this, "CostBudget", {
      budget: {
        budgetName: `response-${stage}`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: prod ? 350 : 200, unit: "USD" },
        costFilters: { TagKeyValue: [`user:Project$DisasterResponse`] },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            { subscriptionType: "EMAIL", address: budgetEmail.valueAsString },
          ],
        },
      ],
    });
    const hosting = new amplify.CfnApp(this, "Frontend", {
      name: `response-${stage}`,
      platform: "WEB",
      buildSpec:
        'version: 1\nfrontend:\n  phases:\n    preBuild:\n      commands:\n        - npm ci\n    build:\n      commands:\n        - npm run build -w apps/web\n  artifacts:\n    baseDirectory: apps/web/dist\n    files:\n      - "**/*"\n  cache:\n    paths:\n      - node_modules/**/*',
      customRules: [
        {
          source: "/api/<*>",
          target: `${apiOrigin.valueAsString}/api/<*>`,
          status: "200",
        },
        { source: "/<*>", target: "/index.html", status: "404-200" },
      ],
    });
    new amplify.CfnBranch(this, "FrontendBranch", {
      appId: hosting.attrAppId,
      branchName: stage,
      enableAutoBuild: false,
      stage: prod ? "PRODUCTION" : "DEVELOPMENT",
    });
    const imageRepo = new ecr.Repository(this, "Images", {
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 20 }],
    });
    if (this.node.tryGetContext("analytics") === "true") {
      const analytics = new s3.Bucket(this, "Analytics", {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.RETAIN,
        lifecycleRules: [{ expiration: Duration.days(365) }],
      });
      analytics.grantReadWrite(worker);
      worker.addEnvironment("ANALYTICS_BUCKET", analytics.bucketName);
      const database = new glue.CfnDatabase(this, "AnalyticsCatalog", {
        catalogId: this.account,
        databaseInput: { name: `response_${stage}` },
      });
      new glue.CfnTable(this, "IncidentAnalytics", {
        catalogId: this.account,
        databaseName: database.ref,
        tableInput: {
          name: "incident_daily",
          tableType: "EXTERNAL_TABLE",
          parameters: { classification: "json" },
          storageDescriptor: {
            location: analytics.s3UrlForObject("daily/"),
            inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
            outputFormat:
              "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
            serdeInfo: {
              serializationLibrary: "org.openx.data.jsonserde.JsonSerDe",
            },
            columns: [
              { name: "day", type: "string" },
              { name: "category", type: "string" },
              { name: "severity", type: "string" },
              { name: "status", type: "string" },
              { name: "incident_count", type: "int" },
              { name: "age_seconds", type: "double" },
            ],
          },
        },
      });
      new athena.CfnWorkGroup(this, "AnalyticsWorkgroup", {
        name: `response-${stage}`,
        workGroupConfiguration: {
          bytesScannedCutoffPerQuery: 1_000_000_000,
          enforceWorkGroupConfiguration: true,
          publishCloudWatchMetricsEnabled: true,
          resultConfiguration: {
            outputLocation: analytics.s3UrlForObject("query-results/"),
            encryptionConfiguration: { encryptionOption: "SSE_S3" },
          },
        },
      });
    }
    if (this.node.tryGetContext("pipeline") === "true") {
      const connection = new CfnParameter(this, "GitConnectionArn", {
        type: "String",
        description: "Approved CodeConnections GitHub connection ARN",
      });
      const source = new codepipeline.Artifact(),
        buildOutput = new codepipeline.Artifact();
      const project = new codebuild.PipelineProject(this, "Build", {
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          privileged: true,
        },
        timeout: Duration.minutes(30),
        environmentVariables: {
          REPOSITORY_URI: { value: imageRepo.repositoryUri },
          AWS_DEFAULT_REGION: { value: this.region },
        },
        buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.yml"),
      });
      imageRepo.grantPullPush(project);
      const pipeline = new codepipeline.Pipeline(this, "DeliveryPipeline", {
        pipelineName: `response-${stage}`,
        pipelineType: codepipeline.PipelineType.V1,
        restartExecutionOnUpdate: false,
      });
      pipeline.addStage({
        stageName: "Source",
        actions: [
          new actions.CodeStarConnectionsSourceAction({
            actionName: "GitHub",
            owner: "ArchiniPatil",
            repo: "Cloud-enabled-Disaster-Response-Management-System",
            branch: "main",
            connectionArn: connection.valueAsString,
            output: source,
            triggerOnPush: false,
          }),
        ],
      });
      pipeline.addStage({
        stageName: "VerifyAndBuild",
        actions: [
          new actions.CodeBuildAction({
            actionName: "TestsAndImage",
            project,
            input: source,
            outputs: [buildOutput],
          }),
        ],
      });
      pipeline.addStage({
        stageName: "Approval",
        actions: [
          new actions.ManualApprovalAction({
            actionName: "ApproveDeployment",
            additionalInformation:
              "Review tests, migration compatibility, costs and rollback before deployment.",
          }),
        ],
      });
      pipeline.addStage({
        stageName: "Deploy",
        actions: [
          new actions.EcsDeployAction({
            actionName: "ECS",
            service: service.service,
            input: buildOutput,
          }),
        ],
      });
    }
    new CfnOutput(this, "ApiLoadBalancer", {
      value: service.loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, "UserPoolId", { value: pool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    new CfnOutput(this, "AmplifyAppId", { value: hosting.attrAppId });
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "ServiceName", { value: service.service.serviceName });
    new CfnOutput(this, "TaskDefinitionArn", {
      value: service.taskDefinition.taskDefinitionArn,
    });
    new CfnOutput(this, "ImageRepository", { value: imageRepo.repositoryUri });
    new CfnOutput(this, "DatabaseSecretArn", {
      value: appDatabaseSecret.secretArn,
    });
  }
}
const app = new App({
  context: { "@aws-cdk/core:validateAgainstDefaultRules": true },
});
new ResponseStack(
  app,
  `DisasterResponse-${app.node.tryGetContext("stage") ?? "dev"}`,
);
