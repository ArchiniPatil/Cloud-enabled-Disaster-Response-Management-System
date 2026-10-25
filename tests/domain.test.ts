import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  incidentSchema,
  canTransition,
  escalationNeeded,
  locationState,
  etaLabel,
  assignmentTransitions,
} from "../packages/core/src/domain";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import { verifyAccess } from "../apps/api/src/auth";
describe("incident validation and state machine", () => {
  it("rejects invalid coordinates and supplied privilege fields", () => {
    const report = {
      category: "MEDICAL",
      severity: "HIGH",
      kind: "EMERGENCY",
      latitude: 19,
      longitude: 72,
    };
    expect(incidentSchema.safeParse(report).success).toBe(true);
    expect(incidentSchema.safeParse({ ...report, latitude: 91 }).success).toBe(
      false,
    );
    expect(incidentSchema.safeParse({ ...report, role: "ADMIN" }).success).toBe(
      false,
    );
  });
  it("rejects skipped and terminal transitions", () => {
    expect(canTransition("SUBMITTED", "ACKNOWLEDGED")).toBe(true);
    expect(canTransition("SUBMITTED", "RESOLVED")).toBe(false);
    expect(canTransition("RESOLVED", "DISPATCHED")).toBe(false);
    expect(canTransition("RESOLVED", "REOPENED")).toBe(true);
    expect(assignmentTransitions.OFFERED.includes("DISPATCHED")).toBe(false);
  });
  it("critical incidents require dispatch even after acknowledgement", () => {
    expect(escalationNeeded("CRITICAL", "ACKNOWLEDGED", false)).toBe(true);
    expect(escalationNeeded("HIGH", "ACKNOWLEDGED", false)).toBe(false);
    expect(escalationNeeded("CRITICAL", "DISPATCHED", true)).toBe(false);
    expect(escalationNeeded("CRITICAL", "CANCELLED", false)).toBe(false);
  });
  it("never labels old or inaccurate coordinates as live", () => {
    const now = Date.now();
    expect(locationState(new Date(now - 91000), 10, now)).toBe("STALE");
    expect(locationState(new Date(now - 1000), 500, now)).toBe("STALE");
    expect(locationState(new Date(now - 1000), 10, now)).toBe("LIVE");
    expect(etaLabel(null)).toBe("ETA unavailable");
    expect(etaLabel(125)).toBe("Estimated 3 min");
  });
});
describe("Cognito token validation contract (local signing key, not live Cognito)", () => {
  it("checks signature, issuer, expiration, access-token use and client", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    const keys = createLocalJWKSet({
      keys: [{ ...jwk, kid: "test", alg: "RS256" }],
    });
    const issue = (
      claims: Record<string, unknown> = {},
      issuer = "https://issuer.test",
    ) =>
      new SignJWT({ token_use: "access", client_id: "client", ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setSubject("user-sub")
        .setIssuer(issuer)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    await expect(
      verifyAccess(await issue(), keys, "https://issuer.test", "client"),
    ).resolves.toHaveProperty("sub", "user-sub");
    await expect(
      verifyAccess(
        await issue({ token_use: "id" }),
        keys,
        "https://issuer.test",
        "client",
      ),
    ).rejects.toThrow();
    await expect(
      verifyAccess(
        await issue({ client_id: "other" }),
        keys,
        "https://issuer.test",
        "client",
      ),
    ).rejects.toThrow();
    await expect(
      verifyAccess(
        await issue({}, "https://wrong.test"),
        keys,
        "https://issuer.test",
        "client",
      ),
    ).rejects.toThrow();
    const expired = await new SignJWT({
      token_use: "access",
      client_id: "client",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("s")
      .setIssuer("https://issuer.test")
      .setExpirationTime(1)
      .sign(privateKey);
    await expect(
      verifyAccess(expired, keys, "https://issuer.test", "client"),
    ).rejects.toThrow();
  });
});

describe("zero-budget deployment policy", () => {
  it("blocks paid deployment before credentials or AWS calls even with an old approval variable", () => {
    const result = spawnSync("bash", ["scripts/deploy.sh", "deploy"], {
      encoding: "utf8",
      env: {
        ...process.env,
        APPROVE_BILLABLE_DEPLOYMENT: "I_REVIEWED_COSTS_AND_APPROVE",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("approved AWS budget is $0");
  });
});

it("blocks an unapproved credit-funded deployment before invoking AWS", () => {
  const root = mkdtempSync(join(tmpdir(), "response-deployment-guard-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "config"));
    copyFileSync(
      "scripts/academic-cloud.mjs",
      join(root, "scripts/academic-cloud.mjs"),
    );
    const policy = JSON.parse(
      readFileSync("config/academic-deployment.json", "utf8"),
    );
    writeFileSync(
      join(root, "config/academic-deployment.json"),
      JSON.stringify({ ...policy, provisioningApproved: false }),
    );
    const result = spawnSync(
      process.execPath,
      [join(root, "scripts/academic-cloud.mjs"), "deploy"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          APPROVE_ACADEMIC_DEPLOYMENT: "REVIEWED_CREDIT_FUNDED_DEMO",
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Deployment blocked");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("defaults to Cognito and keeps fixture startup explicitly opt-in", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  expect(readFileSync(".env.example", "utf8")).toContain("AUTH_MODE=cognito");
  expect(manifest.scripts["dev:demo"]).toContain("--demo");
  const result = spawnSync(process.execPath, ["scripts/dev-local.mjs"], {
    encoding: "utf8",
    env: { ...process.env, AUTH_MODE: "demo" },
  });
  expect(result.status).not.toBe(0);
});
