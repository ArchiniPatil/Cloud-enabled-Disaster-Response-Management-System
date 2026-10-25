import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { config } from "./config.js";
import { pool, transaction, audit } from "./db.js";
import { fail, type User } from "./http.js";
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const cookie = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/v1",
  maxAge: 7 * 86400_000,
};
const issuer = `https://cognito-idp.${config.AWS_REGION}.amazonaws.com/${config.COGNITO_POOL_ID}`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
export async function verifyAccess(
  token: string,
  key: JWTVerifyGetKey = jwks,
  expectedIssuer = issuer,
  clientId = config.COGNITO_CLIENT_ID,
) {
  const { payload } = await jwtVerify(token, key, {
    issuer: expectedIssuer,
    algorithms: ["RS256"],
  });
  if (
    payload.token_use !== "access" ||
    payload.client_id !== clientId ||
    !payload.sub
  )
    fail(401, "INVALID_TOKEN", "Invalid identity token");
  return payload;
}
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(config.SESSION_KEY!).digest(),
    iv,
  );
  return Buffer.concat([
    iv,
    cipher.update(value),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
function decrypt(value: string) {
  const b = Buffer.from(value, "base64");
  const d = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(config.SESSION_KEY!).digest(),
    b.subarray(0, 12),
  );
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString();
}
async function newSession(
  res: Response,
  user: User,
  refresh?: string,
  expires = 900,
) {
  const token = random(),
    csrf = random();
  await pool.query(
    "INSERT INTO sessions(id_hash,user_id,csrf,version,refresh_cipher,access_expires,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 second',now()+interval '7 days')",
    [
      hash(token),
      user.id,
      csrf,
      user.session_version,
      refresh ? encrypt(refresh) : null,
      expires,
    ],
  );
  res.cookie("response_session", token, cookie);
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = req.cookies.response_session;
    if (!token) fail(401, "SIGN_IN_REQUIRED", "Please sign in");
    const id = hash(token);
    const result = await transaction(async (db) => {
      const s = (
        await db.query(
          "SELECT * FROM sessions WHERE id_hash=$1 AND expires_at>now() FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!s) fail(401, "SESSION_EXPIRED", "Please sign in again");
      const u = (
        await db.query(
          "SELECT *,ARRAY(SELECT permission FROM user_permissions WHERE user_id=user_profiles.id) AS permissions FROM user_profiles WHERE id=$1",
          [s.user_id],
        )
      ).rows[0] as User;
      if (!u || u.status !== "ACTIVE" || u.session_version !== s.version)
        fail(401, "SESSION_REVOKED", "Session is no longer authorized");
      if (new Date(s.access_expires).getTime() < Date.now()) {
        if (config.AUTH_MODE === "demo")
          await db.query(
            "UPDATE sessions SET access_expires=now()+interval '15 minutes' WHERE id_hash=$1",
            [id],
          );
        else {
          if (!s.refresh_cipher)
            fail(401, "SESSION_EXPIRED", "Please sign in again");
          const response = await fetch(
            `${config.COGNITO_DOMAIN}/oauth2/token`,
            {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: config.COGNITO_CLIENT_ID!,
                refresh_token: decrypt(s.refresh_cipher),
              }),
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!response.ok)
            fail(401, "SESSION_EXPIRED", "Please sign in again");
          const tokens = await response.json();
          const claims = await verifyAccess(tokens.access_token);
          if (claims.sub !== u.cognito_sub)
            fail(401, "INVALID_TOKEN", "Session identity mismatch");
          await db.query(
            "UPDATE sessions SET access_expires=now()+$2*interval '1 second',refresh_cipher=$3 WHERE id_hash=$1",
            [
              id,
              tokens.expires_in,
              tokens.refresh_token
                ? encrypt(tokens.refresh_token)
                : s.refresh_cipher,
            ],
          );
        }
      }
      return { u, s };
    });
    req.user = result.u;
    req.sessionHash = id;
    req.csrf = result.s.csrf;
    next();
  } catch (e) {
    next(e);
  }
}
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const received = req.get("x-csrf-token") ?? "";
  if (
    req.get("origin") !== config.APP_ORIGIN ||
    received.length !== req.csrf.length ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(req.csrf))
  )
    return next(
      Object.assign(new Error("Invalid request origin or CSRF token"), {
        status: 403,
        code: "CSRF_REJECTED",
      }),
    );
  next();
}
export const authRouter = Router();
authRouter.get("/config", (_req, res) =>
  res.json({
    mode: config.AUTH_MODE,
    realtime: config.REALTIME_TRANSPORT,
    identityConfigured:
      config.AUTH_MODE === "cognito" &&
      !!config.COGNITO_DOMAIN &&
      !!config.COGNITO_CLIENT_ID &&
      !!config.COGNITO_POOL_ID,
    emergencyPhone: config.EMERGENCY_PHONE ?? null,
  }),
);
authRouter.get(["/login", "/register", "/recover"], async (req, res) => {
  if (
    config.AUTH_MODE !== "cognito" ||
    !config.COGNITO_DOMAIN ||
    !config.COGNITO_CLIENT_ID
  )
    fail(503, "IDENTITY_UNCONFIGURED", "Cognito has not been configured");
  const state = random(),
    verifier = random();
  await pool.query(
    "INSERT INTO oauth_states(id_hash,verifier,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [hash(state), verifier],
  );
  res.cookie("oauth_state", state, { ...cookie, maxAge: 600000 });
  const destination =
    req.path === "/register"
      ? "/signup"
      : req.path === "/recover"
        ? "/forgotPassword"
        : "/oauth2/authorize";
  const url = new URL(`${config.COGNITO_DOMAIN}${destination}`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.COGNITO_CLIENT_ID!,
    redirect_uri: `${config.APP_ORIGIN}/api/v1/auth/callback`,
    scope: "openid email profile",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  res.redirect(url.toString());
});
authRouter.get("/callback", async (req, res) => {
  const state = z.string().parse(req.query.state);
  if (state !== req.cookies.oauth_state)
    fail(400, "OAUTH_STATE", "Sign-in state mismatch");
  const saved = (
    await pool.query(
      "DELETE FROM oauth_states WHERE id_hash=$1 AND expires_at>now() RETURNING verifier",
      [hash(state)],
    )
  ).rows[0];
  if (!saved) fail(400, "OAUTH_STATE", "Sign-in expired");
  const r = await fetch(`${config.COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.COGNITO_CLIENT_ID!,
      redirect_uri: `${config.APP_ORIGIN}/api/v1/auth/callback`,
      code: z.string().parse(req.query.code),
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) fail(401, "SIGN_IN_FAILED", "Identity provider rejected sign-in");
  const tokens = await r.json();
  const claims = await verifyAccess(tokens.access_token);
  const identity = await jwtVerify(tokens.id_token, jwks, {
    issuer,
    audience: config.COGNITO_CLIENT_ID,
    algorithms: ["RS256"],
  });
  if (
    identity.payload.token_use !== "id" ||
    identity.payload.sub !== claims.sub ||
    identity.payload.email_verified !== true
  )
    fail(403, "EMAIL_UNVERIFIED", "Verify your email before signing in");
  const user = await transaction(async (db) => {
    const existing = (
      await db.query("SELECT * FROM user_profiles WHERE cognito_sub=$1", [
        claims.sub,
      ])
    ).rows[0];
    if (existing) return existing;
    return (
      await db.query(
        "INSERT INTO user_profiles(cognito_sub,email,name,role) VALUES($1,$2,$3,'CITIZEN') ON CONFLICT(cognito_sub) DO UPDATE SET cognito_sub=excluded.cognito_sub RETURNING *",
        [
          claims.sub,
          identity.payload.email,
          identity.payload.name ?? identity.payload.email,
        ],
      )
    ).rows[0];
  });
  if (user.status !== "ACTIVE")
    fail(403, "ACCOUNT_SUSPENDED", "Account is inactive");
  await newSession(res, user, tokens.refresh_token, tokens.expires_in);
  res
    .clearCookie("oauth_state", { path: "/api/v1" })
    .redirect(config.APP_ORIGIN);
});
authRouter.post("/demo", async (req, res) => {
  if (config.AUTH_MODE !== "demo") fail(404, "NOT_FOUND", "Not found");
  if (req.get("origin") !== config.APP_ORIGIN)
    fail(403, "ORIGIN", "Invalid request origin");
  const email = z
    .enum([
      "citizen@demo.invalid",
      "authority@demo.invalid",
      "rescuer@demo.invalid",
      "admin@demo.invalid",
    ])
    .parse(req.body.email);
  const u = (
    await pool.query(
      "SELECT * FROM user_profiles WHERE email=$1 AND status=$2",
      [email, "ACTIVE"],
    )
  ).rows[0];
  if (!u) fail(503, "DEMO_UNSEEDED", "Run the demo seed");
  await newSession(res, u);
  res.json({ ok: true });
});
authRouter.get("/me", authenticate, (req, res) =>
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      department_id: req.user.department_id,
      jurisdiction_id: req.user.jurisdiction_id,
      permissions: req.user.permissions,
    },
    csrf: req.csrf,
  }),
);
authRouter.post("/logout", authenticate, csrf, async (req, res) => {
  let providerRevoked = config.AUTH_MODE === "demo";
  if (config.AUTH_MODE === "cognito") {
    const session = (
      await pool.query("SELECT refresh_cipher FROM sessions WHERE id_hash=$1", [
        req.sessionHash,
      ])
    ).rows[0];
    if (session?.refresh_cipher)
      try {
        const revoked = await fetch(`${config.COGNITO_DOMAIN}/oauth2/revoke`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.COGNITO_CLIENT_ID!,
            token: decrypt(session.refresh_cipher),
          }),
          signal: AbortSignal.timeout(10000),
        });
        providerRevoked = revoked.ok;
      } catch {
        providerRevoked = false;
      }
  }
  await transaction(async (db) => {
    await db.query("DELETE FROM sessions WHERE id_hash=$1", [req.sessionHash]);
    await db.query(
      "UPDATE location_sessions SET active=false,stopped_at=now() WHERE user_id=$1 AND active",
      [req.user.id],
    );
    await audit(db, req.user.id, "LOGOUT", "user", req.user.id);
  });
  res.clearCookie("response_session", { path: "/api/v1" }).json({
    ok: true,
    providerRevoked,
    logoutUrl: config.COGNITO_DOMAIN
      ? `${config.COGNITO_DOMAIN}/logout?client_id=${encodeURIComponent(config.COGNITO_CLIENT_ID!)}&logout_uri=${encodeURIComponent(config.APP_ORIGIN)}`
      : null,
  });
});
