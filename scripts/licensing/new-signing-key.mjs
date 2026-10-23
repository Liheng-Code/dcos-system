#!/usr/bin/env node
// Creates a DCOS license signing key (licensing design 4.3).
//
//   node scripts/licensing/new-signing-key.mjs --kid hq-2026-01 --out <path>/dcos-signing-hq-2026-01.key.json
//   node scripts/licensing/new-signing-key.mjs --kid dev-local --dev --out .licensing/dev-local.key.json
//
// Writes the passphrase-encrypted private key file and prints the public-key entry
// to paste into apps/web/lib/licensing/keys.ts. Keep the key file OUT of the repo,
// make two offline copies, and store the passphrase separately from both.
// --dev marks the key devOnly: production builds will not accept its signatures.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { encryptKey, parseArgs, readPassphrase } from "./key-file.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.kid || !args.out) {
  console.error("Usage: new-signing-key.mjs --kid <key id> --out <file> [--dev]");
  process.exit(1);
}
if (existsSync(args.out)) {
  console.error(`${args.out} already exists; refusing to overwrite a signing key.`);
  process.exit(1);
}

const passphrase = await readPassphrase("Passphrase for the new key: ");
if (passphrase.length < 12) {
  console.error("Use a passphrase of at least 12 characters.");
  process.exit(1);
}
if (!process.env.DCOS_SIGNING_PASSPHRASE) {
  const again = await readPassphrase("Repeat the passphrase: ");
  if (again !== passphrase) {
    console.error("The passphrases do not match.");
    process.exit(1);
  }
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, JSON.stringify(encryptKey(privateKey, args.kid, passphrase), null, 2) + "\n", { mode: 0o600 });

const x = publicKey.export({ format: "jwk" }).x;
console.log(`\nEncrypted key written to ${args.out}`);
console.log("\nAdd this entry to KEYS in apps/web/lib/licensing/keys.ts:\n");
console.log(`  { kid: "${args.kid}", x: "${x}"${args.dev ? ", devOnly: true" : ""} },\n`);
