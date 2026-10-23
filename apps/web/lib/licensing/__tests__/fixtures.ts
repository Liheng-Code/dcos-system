import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import type { LicenseClaims } from "@/lib/licensing/claims";
import type { TrustedKey } from "@/lib/licensing/keys";

export const DAY = 86_400_000;
export const at = (iso: string) => Date.parse(iso + "T12:00:00Z");

export function makeClaims(overrides: Partial<LicenseClaims["lic"]> = {}, ent: Partial<LicenseClaims["ent"]> = {}): LicenseClaims {
  return {
    iss: "dcos-hq",
    sub: "tnt_test",
    aud: "dep_test",
    jti: "lt_test_1",
    iat: Date.parse("2026-01-01T00:00:00Z") / 1000,
    nbf: Date.parse("2026-01-01T00:00:00Z") / 1000,
    exp: Date.parse("2028-12-31T00:00:00Z") / 1000,
    prof: "online",
    lic: {
      id: "DCOS-L-000001",
      rev: 2,
      type: "subscription",
      plan: "PRO",
      from: "2026-01-01",
      until: "2026-12-31",
      grace_days: 14,
      readonly_days: 30,
      hq_state: "active",
      suspend_mode: null,
      notice: null,
      ...overrides,
    },
    ent: {
      modules: ["planning", "qs"],
      features: ["ai_qs"],
      limits: { users: 10, viewers: 5, projects: 3 },
      ...ent,
    },
  };
}

export function makeKey(kid = "test-1"): { trusted: TrustedKey; privateKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { trusted: { kid, x: publicKey.export({ format: "jwk" }).x as string }, privateKey };
}

// Signs exactly as scripts/licensing/issue-license.mjs does.
export function signToken(claims: unknown, privateKey: KeyObject, kid: string, header: Record<string, unknown> = {}): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const input = `${b64({ alg: "EdDSA", typ: "dcos-license+jwt", kid, ...header })}.${b64(claims)}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString("base64url")}`;
}
