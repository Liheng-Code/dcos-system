// Public keys whose license signatures this build accepts (design section 4.3).
// Keys ship only in the app build, never over the network. To add one, run
// `node scripts/licensing/new-signing-key.mjs` and paste the printed entry here.
// Rotation: add the new key and release the app BEFORE signing with it.

// Development keys (devOnly) are rejected by production builds, so a key that
// lives on a developer machine can never license a customer deployment.

import type { TrustedKey } from "@dcos/licensing/verify";

export type { TrustedKey };

const KEYS: TrustedKey[] = [
  // Local development key (.licensing/dev-local.key.json, not in the repo). Rejected by production builds.
  { kid: "dev-local", x: "G-feCRl0q4NlFzPk9wzugiZx32uaXCZUHbgvt1Ymy8Q", devOnly: true },
];

export function trustedKeys(): TrustedKey[] {
  const production = process.env.NODE_ENV === "production" && process.env.DCOS_LICENSE_ALLOW_DEV_KEYS !== "true";
  return production ? KEYS.filter((k) => !k.devOnly) : KEYS;
}
