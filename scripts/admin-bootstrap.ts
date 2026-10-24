import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { config } from "../apps/api/src/config.js";
import { transaction, audit } from "../apps/api/src/db.js";
export async function bootstrapAdmin(username: string) {
  if (!username || !config.COGNITO_POOL_ID || config.AUTH_MODE !== "cognito")
    throw new Error(
      "Existing Cognito username and identity configuration required",
    );
  const identity = await new CognitoIdentityProviderClient({
    region: config.AWS_REGION,
  }).send(
    new AdminGetUserCommand({
      UserPoolId: config.COGNITO_POOL_ID,
      Username: username,
    }),
  );
  const attrs = Object.fromEntries(
    (identity.UserAttributes ?? []).map((a) => [a.Name!, a.Value!]),
  );
  if (
    !identity.Enabled ||
    attrs.email_verified !== "true" ||
    !identity.UserMFASettingList?.includes("SOFTWARE_TOKEN_MFA")
  )
    throw new Error(
      "Bootstrap requires an enabled user with verified email and TOTP MFA",
    );
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('admin-bootstrap'))");
    if (
      (await db.query("SELECT 1 FROM user_profiles WHERE role='ADMIN'"))
        .rowCount
    )
      throw new Error(
        "An administrator already exists; bootstrap is unavailable",
      );
    const u = (
      await db.query(
        "INSERT INTO user_profiles(cognito_sub,email,name,role) VALUES($1,$2,$3,'ADMIN') ON CONFLICT(cognito_sub) DO UPDATE SET role='ADMIN',session_version=user_profiles.session_version+1 RETURNING id",
        [attrs.sub, attrs.email, attrs.name ?? attrs.email],
      )
    ).rows[0];
    await audit(db, null, "INITIAL_ADMIN_BOOTSTRAP", "user", u.id);
    return { id: u.id };
  });
}
