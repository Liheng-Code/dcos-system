// Passphrase-encrypted Ed25519 signing key file (licensing design 4.3, owner
// decision 6). Envelope: { kid, alg, kdf: "scrypt", N, r, p, salt, iv, tag,
// ciphertext }, the PKCS#8 private key encrypted with AES-256-GCM under a key
// derived from the passphrase by scrypt. The file is useless without the passphrase.

import { createCipheriv, createDecipheriv, createPrivateKey, randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const SCRYPT = { N: 2 ** 17, r: 8, p: 1 };
const MAXMEM = 256 * 1024 * 1024;

export function encryptKey(privateKey, kid, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { ...SCRYPT, maxmem: MAXMEM });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const der = privateKey.export({ type: "pkcs8", format: "der" });
  const ciphertext = Buffer.concat([cipher.update(der), cipher.final()]);
  return {
    kid,
    alg: "Ed25519",
    kdf: "scrypt",
    ...SCRYPT,
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function decryptKey(envelope, passphrase) {
  if (envelope.alg !== "Ed25519" || envelope.kdf !== "scrypt") throw new Error("Unsupported key file.");
  const key = scryptSync(passphrase, Buffer.from(envelope.salt, "base64url"), 32, {
    N: envelope.N,
    r: envelope.r,
    p: envelope.p,
    maxmem: MAXMEM,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  let der;
  try {
    der = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
  } catch {
    throw new Error("Wrong passphrase, or the key file is damaged.");
  }
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

// Reads a passphrase without echoing it. DCOS_SIGNING_PASSPHRASE is honoured for
// scripted use (tests); never put it in a shell profile.
export async function readPassphrase(prompt) {
  if (process.env.DCOS_SIGNING_PASSPHRASE) return process.env.DCOS_SIGNING_PASSPHRASE;
  if (!process.stdin.isTTY) throw new Error("No terminal to read the passphrase from; set DCOS_SIGNING_PASSPHRASE.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => {
    if (s.startsWith(prompt)) rl.output.write(prompt);
  };
  const answer = await new Promise((resolve) => rl.question(prompt, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true;
    else {
      args[a.slice(2)] = next;
      i++;
    }
  }
  return args;
}
