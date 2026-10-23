import { describe, expect, it } from "vitest";
import { verifyLicenseToken } from "@/lib/licensing/token";
import { at, makeClaims, makeKey, signToken } from "./fixtures";

const { trusted, privateKey } = makeKey("test-1");
const opts = { keys: [trusted], deploymentId: "dep_test", now: at("2026-06-01") };

describe("verifyLicenseToken", () => {
  it("accepts a correctly signed token for this deployment", () => {
    const result = verifyLicenseToken(signToken(makeClaims(), privateKey, "test-1"), opts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.claims.lic.id).toBe("DCOS-L-000001");
  });

  it("rejects a token whose claims were edited after signing", () => {
    const token = signToken(makeClaims(), privateKey, "test-1");
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify(makeClaims({}, { modules: ["hr"] }))).toString("base64url");
    expect(verifyLicenseToken(`${h}.${forged}.${s}`, opts)).toMatchObject({ ok: false, error: "Invalid signature." });
  });

  it("rejects a token signed by an unknown key", () => {
    const other = makeKey("test-1");
    const result = verifyLicenseToken(signToken(makeClaims(), other.privateKey, "test-1"), opts);
    expect(result).toMatchObject({ ok: false, error: "Invalid signature." });
    expect(verifyLicenseToken(signToken(makeClaims(), privateKey, "nope"), opts)).toMatchObject({ ok: false });
  });

  it("rejects a token for another deployment", () => {
    const result = verifyLicenseToken(signToken(makeClaims(), privateKey, "test-1"), { ...opts, deploymentId: "dep_other" });
    expect(result.ok).toBe(false);
  });

  it("rejects a rollback to an older revision", () => {
    const token = signToken(makeClaims({ rev: 2 }), privateKey, "test-1");
    expect(verifyLicenseToken(token, { ...opts, minRev: 2 }).ok).toBe(true);
    expect(verifyLicenseToken(token, { ...opts, minRev: 3 }).ok).toBe(false);
  });

  it("rejects revoked tokens and withdrawn keys", () => {
    const token = signToken(makeClaims(), privateKey, "test-1");
    expect(verifyLicenseToken(token, { ...opts, revokedJtis: ["lt_test_1"] }).ok).toBe(false);
    expect(verifyLicenseToken(token, { ...opts, compromisedKids: ["test-1"] }).ok).toBe(false);
  });

  it("rejects a token past exp and one not yet valid", () => {
    const token = signToken(makeClaims(), privateKey, "test-1");
    expect(verifyLicenseToken(token, { ...opts, now: at("2029-01-01") }).ok).toBe(false);
    expect(verifyLicenseToken(token, { ...opts, now: at("2025-06-01") }).ok).toBe(false);
  });

  it("rejects other algorithms and malformed input", () => {
    expect(verifyLicenseToken(signToken(makeClaims(), privateKey, "test-1", { alg: "none" }), opts).ok).toBe(false);
    expect(verifyLicenseToken("not-a-token", opts).ok).toBe(false);
    expect(verifyLicenseToken(signToken({ hello: "world" }, privateKey, "test-1"), opts).ok).toBe(false);
  });
});
