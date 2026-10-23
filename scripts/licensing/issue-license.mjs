#!/usr/bin/env node
// Signs a DCOS license token (licensing design 4, Phase 1 stand-in for DCOS HQ).
//
//   node scripts/licensing/issue-license.mjs --key <key file> --spec <license.json> [--out token.txt]
//
// The spec is the token's claims without the generated fields (iat, nbf, exp, jti);
// see scripts/licensing/example-license.json. The token is printed (and written to
// --out) for the customer's administrator to paste into Administration > License.
// Raise lic.rev for every new token of the same license: a deployment refuses a
// revision lower than the one it has.

import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, sign } from "node:crypto";
import { decryptKey, parseArgs, readPassphrase } from "./key-file.mjs";

const DAY = 86_400;

const args = parseArgs(process.argv.slice(2));
if (!args.key || !args.spec) {
  console.error("Usage: issue-license.mjs --key <key file> --spec <license.json> [--out <file>]");
  process.exit(1);
}

const envelope = JSON.parse(readFileSync(args.key, "utf8"));
const spec = JSON.parse(readFileSync(args.spec, "utf8"));

for (const field of ["iss", "sub", "aud", "prof", "lic", "ent"]) {
  if (spec[field] === undefined) {
    console.error(`The spec is missing "${field}".`);
    process.exit(1);
  }
}
const { lic } = spec;
const until = Date.parse(lic.until + "T00:00:00Z") / 1000 + DAY;
if (!Number.isFinite(until)) {
  console.error("lic.until must be a date (YYYY-MM-DD).");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const claims = {
  ...spec,
  jti: `lt_${lic.id}_r${lic.rev}_${randomBytes(4).toString("hex")}`,
  iat: now,
  nbf: now - 300,
  // The token outlives the term by the grace and read-only periods plus 30 days,
  // so the app itself walks the customer through expiry (design 4.2).
  exp: until + (lic.grace_days + lic.readonly_days + 30) * DAY,
};

const passphrase = await readPassphrase(`Passphrase for ${envelope.kid}: `);
const privateKey = decryptKey(envelope, passphrase);

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const signingInput = `${b64({ alg: "EdDSA", typ: "dcos-license+jwt", kid: envelope.kid })}.${b64(claims)}`;
const signature = sign(null, Buffer.from(signingInput), privateKey).toString("base64url");
const token = `${signingInput}.${signature}`;

if (args.out) writeFileSync(args.out, token + "\n");
console.log(`\nLicense ${lic.id} revision ${lic.rev} for ${spec.aud}, valid ${lic.from} to ${lic.until}:\n`);
console.log(token + "\n");
