import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { verifyLicenseToken } from "@dcos/licensing/verify";
// The same encryption the owner's key file is written with.
import { encryptKey } from "../../../../scripts/licensing/key-file.mjs";
import { parseKeyFile, signClaims } from "@/lib/signing/key-file";
import { claimsForSigning, claimsMismatch, type ClaimsInput } from "@/lib/license-claims";
import { makeLicense } from "./fixtures";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const x = publicKey.export({ format: "jwk" }).x as string;
const envelope = parseKeyFile(JSON.stringify(encryptKey(privateKey, "test-key", "correct horse battery")));

const input: ClaimsInput = {
  license: makeLicense(),
  tenant: { code: "ABC", display_name: "ABC Construction" },
  deployment: { deployment_code: "dep_abc_prod", topology: "saas_dedicated" },
  plan: { code: "PRO", display_name: "Professional" },
};

describe("browser signing with the encrypted key file", () => {
  it("produces a token the tenant app accepts, matching the revision", async () => {
    const claims = claimsForSigning(input);
    const token = await signClaims(envelope, "correct horse battery", claims, x);
    const verified = verifyLicenseToken(token, { keys: [{ kid: "test-key", x }], deploymentId: "dep_abc_prod", now: Date.now() });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.lic.id).toBe("DCOS-L-000001");
      expect(claimsMismatch(verified.claims, input)).toBeNull();
    }
  }, 30_000);

  it("refuses a wrong passphrase", async () => {
    await expect(signClaims(envelope, "wrong passphrase", claimsForSigning(input), x)).rejects.toThrow(/Wrong passphrase/);
  }, 30_000);

  it("refuses a key file that does not match the registered public key", async () => {
    const other = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x as string;
    await expect(signClaims(envelope, "correct horse battery", claimsForSigning(input), other)).rejects.toThrow(/does not match/);
  }, 30_000);
});

describe("claimsMismatch", () => {
  it("rejects claims edited before signing", () => {
    const claims = claimsForSigning(input);
    const edited = { ...claims, ent: { ...claims.ent, modules: [...claims.ent.modules, "hr"] } };
    expect(claimsMismatch(edited, input)).toMatch(/does not match/);
  });

  it("rejects a token id from another revision", () => {
    const claims = claimsForSigning(input);
    expect(claimsMismatch({ ...claims, jti: "lt_DCOS-L-000001_r9_abc" }, input)).toMatch(/token id/);
  });

  it("rejects a stale signature", () => {
    const old = claimsForSigning(input, Date.now() - 2 * 3_600_000);
    expect(claimsMismatch(old, input)).toMatch(/too old/);
  });
});
