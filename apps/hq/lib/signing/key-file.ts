// Signs license claims IN THE BROWSER with the owner's encrypted key file
// (design 4.3, owner decision 6). The file format is the one written by
// scripts/licensing/new-signing-key.mjs. The private key exists only in this
// page's memory for the duration of one signature; it is never sent anywhere.

import { scryptAsync } from "@noble/hashes/scrypt";
import { ed25519 } from "@noble/curves/ed25519";
import { base64urlBytes, base64urlToBytes, signingInput, type LicenseClaims } from "@dcos/licensing";

export interface KeyEnvelope {
  kid: string;
  alg: "Ed25519";
  kdf: "scrypt";
  N: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

// PKCS#8 wrapping of a raw Ed25519 seed (RFC 8410): 16 fixed bytes, then the 32-byte seed.
const PKCS8_ED25519_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

export function parseKeyFile(text: string): KeyEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not a DCOS signing key.");
  }
  const e = parsed as Partial<KeyEnvelope>;
  if (e.alg !== "Ed25519" || e.kdf !== "scrypt" || !e.kid || !e.ciphertext || !e.tag || !e.iv || !e.salt) {
    throw new Error("That file is not a DCOS signing key.");
  }
  return e as KeyEnvelope;
}

async function decryptSeed(envelope: KeyEnvelope, passphrase: string): Promise<Uint8Array> {
  const key = await scryptAsync(new TextEncoder().encode(passphrase), base64urlToBytes(envelope.salt), {
    N: envelope.N,
    r: envelope.r,
    p: envelope.p,
    dkLen: 32,
    maxmem: 256 * 1024 * 1024,
  });
  const aesKey = await crypto.subtle.importKey("raw", key as BufferSource, "AES-GCM", false, ["decrypt"]);
  const ciphertext = base64urlToBytes(envelope.ciphertext);
  const tag = base64urlToBytes(envelope.tag);
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);
  let der: Uint8Array;
  try {
    der = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64urlToBytes(envelope.iv) as BufferSource }, aesKey, sealed as BufferSource),
    );
  } catch {
    throw new Error("Wrong passphrase, or the key file is damaged.");
  }
  if (der.length !== 48 || PKCS8_ED25519_PREFIX.some((b, i) => der[i] !== b)) {
    throw new Error("The key file does not hold an Ed25519 key.");
  }
  const seed = der.slice(16);
  der.fill(0);
  return seed;
}

// Returns the compact JWS token. expectedPublicKey is the registered public key
// for envelope.kid; signing with a different key is refused before it happens.
export async function signClaims(
  envelope: KeyEnvelope,
  passphrase: string,
  claims: LicenseClaims,
  expectedPublicKey: string,
): Promise<string> {
  const seed = await decryptSeed(envelope, passphrase);
  try {
    if (base64urlBytes(ed25519.getPublicKey(seed)) !== expectedPublicKey) {
      throw new Error(`This key file does not match the registered public key for ${envelope.kid}.`);
    }
    const input = signingInput(envelope.kid, claims);
    const signature = ed25519.sign(new TextEncoder().encode(input), seed);
    return `${input}.${base64urlBytes(signature)}`;
  } finally {
    seed.fill(0);
  }
}
