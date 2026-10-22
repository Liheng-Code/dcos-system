// The license token's wire format (design 4.1): a compact JWS signed with Ed25519,
// base64url(header).base64url(claims).base64url(signature). Runtime-neutral (no
// node:crypto), so DCOS HQ can build the signing input in the browser.

import type { LicenseClaims } from "./claims";

export const TOKEN_TYP = "dcos-license+jwt";

const DAY_S = 86_400;

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

export function base64urlBytes(bytes: Uint8Array): string {
  return base64url(bytes);
}

export function base64urlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// What gets signed: header.claims.
export function signingInput(kid: string, claims: LicenseClaims): string {
  return `${base64urlJson({ alg: "EdDSA", typ: TOKEN_TYP, kid })}.${base64urlJson(claims)}`;
}

// The token outlives the term by the grace and read-only periods plus 30 days, so
// the app itself walks the customer through expiry (design 4.2).
export function tokenExpiry(until: string, graceDays: number, readonlyDays: number): number {
  const termEnd = Date.parse(until + "T00:00:00Z") / 1000 + DAY_S;
  return termEnd + (graceDays + readonlyDays + 30) * DAY_S;
}
