import {
  App,
  Stack,
  Duration,
  RemovalPolicy,
  CfnOutput,
  Tags,
  aws_cognito as cognito,
} from "aws-cdk-lib";

// Optional identity-only academic demonstration. Synthesis creates no resources.
// Provisioning still requires an account-specific Free Tier/credit and cost review.
const app = new App();
const stack = new Stack(app, "ResponseAcademicIdentity", {
  env: {
    region: process.env.CDK_DEFAULT_REGION ?? "ap-south-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
Tags.of(stack).add("Project", "DisasterResponse");
Tags.of(stack).add("Environment", "academic");
const pool = new cognito.UserPool(stack, "Identity", {
  featurePlan: cognito.FeaturePlan.LITE,
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  signInCaseSensitive: false,
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
const client = pool.addClient("Browser", {
  generateSecret: false,
  authFlows: { userSrp: true },
  oAuth: {
    flows: { authorizationCodeGrant: true },
    scopes: [
      cognito.OAuthScope.OPENID,
      cognito.OAuthScope.EMAIL,
      cognito.OAuthScope.PROFILE,
    ],
    callbackUrls: ["http://localhost:5173/api/v1/auth/callback"],
    logoutUrls: ["http://localhost:5173"],
  },
  accessTokenValidity: Duration.minutes(15),
  idTokenValidity: Duration.minutes(15),
  refreshTokenValidity: Duration.days(7),
  enableTokenRevocation: true,
  preventUserExistenceErrors: true,
});
const domain = pool.addDomain("Login", {
  cognitoDomain: {
    domainPrefix: `response-academic-${stack.account}-${stack.region}`,
  },
});
new CfnOutput(stack, "UserPoolId", { value: pool.userPoolId });
new CfnOutput(stack, "ClientId", { value: client.userPoolClientId });
new CfnOutput(stack, "LoginDomain", { value: domain.baseUrl() });
new CfnOutput(stack, "Region", { value: stack.region });
