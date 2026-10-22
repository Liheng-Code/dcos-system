// License token verification (design section 4). A token is a compact JWS signed
// with Ed25519: base64url(header).base64url(claims).base64url(signature).
// Server-only: uses node:crypto, so it is not exported from the package index
// (import "@dcos/licensing/verify").

import { createPublicKey, verify } from "node:crypto";
import { licenseClaimsSchema, type LicenseClaims } from "./claims";
import { TOKEN_TYP } from "./token-format";

export interface TrustedKey {
  kid: string;
  // Ed25519 public key, base64url (JWK "x").
  x: string;
  // Development keys are rejected by production builds of the tenant app.
  devOnly?: boolean;
}

export interface VerifyOptions {
  keys: TrustedKey[];
  // This deployment's id; the token's aud must match it.
  deploymentId: string;
  now: number;
  // Highest revision already installed; a lower one is a rollback.
  minRev?: number;
  revokedJtis?: string[];
  compromisedKids?: string[];
}

export type VerifyResult =
  | { ok: true; claims: LicenseClaims; kid: string }
  | { ok: false; error: string };

function b64urlDecode(part: string): Buffer {
  return Buffer.from(part, "base64url");
}

export function decodeTokenUnverified(token: string): { header: unknown; claims: unknown } | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(b64urlDecode(parts[0]).toString("utf8")),
      claims: JSON.parse(b64urlDecode(parts[1]).toString("utf8")),
    };
  } catch {
    return null;
  }
}

export function verifyLicenseToken(token: string, opts: VerifyOptions): VerifyResult {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { ok: false, error: "Not a license token." };
  const decoded = decodeTokenUnverified(token);
  if (!decoded) return { ok: false, error: "The token could not be decoded." };

  const header = decoded.header as { alg?: string; typ?: string; kid?: string };
  if (header.alg !== "EdDSA" || header.typ !== TOKEN_TYP || !header.kid) {
    return { ok: false, error: "Unsupported token header." };
  }
  if (opts.compromisedKids?.includes(header.kid)) {
    return { ok: false, error: `Signing key ${header.kid} has been withdrawn.` };
  }
  const key = opts.keys.find((k) => k.kid === header.kid);
  if (!key) return { ok: false, error: `Unknown signing key ${header.kid}.` };

  const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.x }, format: "jwk" });
  const signed = Buffer.from(parts[0] + "." + parts[1], "utf8");
  if (!verify(null, signed, publicKey, b64urlDecode(parts[2]))) {
    return { ok: false, error: "Invalid signature." };
  }

  const parsed = licenseClaimsSchema.safeParse(decoded.claims);
  if (!parsed.success) return { ok: false, error: "The token's contents are not a valid license." };
  const claims = parsed.data;

  const nowSec = Math.floor(opts.now / 1000);
  if (claims.aud !== opts.deploymentId) {
    return { ok: false, error: `This license is for deployment ${claims.aud}, not ${opts.deploymentId}.` };
  }
  if (claims.nbf > nowSec) return { ok: false, error: "This license is not valid yet." };
  if (claims.exp <= nowSec) return { ok: false, error: "This license token has expired." };
  if (opts.minRev !== undefined && claims.lic.rev < opts.minRev) {
    return { ok: false, error: `Revision ${claims.lic.rev} is older than the installed revision ${opts.minRev}.` };
  }
  if (opts.revokedJtis?.includes(claims.jti)) return { ok: false, error: "This license has been revoked." };

  return { ok: true, claims, kid: header.kid };
}
