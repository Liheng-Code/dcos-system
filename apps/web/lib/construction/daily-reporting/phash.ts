// Module 10-01 Daily Reporting — perceptual hash of a photo and the PHOTO_REUSE
// comparison (design §10.2). Pure functions: decoding the image is done by the
// caller (server.ts), so this file can be unit tested and holds no image
// library.
//
// The hash is a 64-bit difference hash (dHash): the photo is reduced to 9 x 8
// grey pixels and each bit says whether a pixel is brighter than its right
// neighbour. Re-saving, resizing or recompressing a photo changes few bits;
// a different photo changes about half of them.

export const PHASH_WIDTH = 9;
export const PHASH_HEIGHT = 8;

/**
 * Hash of a 9 x 8 greyscale image, row by row, as 16 hex characters. Returns
 * null for an image with no contrast at all (a blank frame): every blank frame
 * would otherwise "match" every other one.
 */
export function dhashFromGray(pixels: ArrayLike<number>): string | null {
  if (pixels.length < PHASH_WIDTH * PHASH_HEIGHT) return null;
  let hex = "";
  let any = false;
  for (let row = 0; row < PHASH_HEIGHT; row++) {
    let byte = 0;
    for (let col = 0; col < PHASH_WIDTH - 1; col++) {
      const i = row * PHASH_WIDTH + col;
      byte = (byte << 1) | (pixels[i] > pixels[i + 1] ? 1 : 0);
    }
    if (byte !== 0) any = true;
    hex += byte.toString(16).padStart(2, "0");
  }
  return any ? hex : null;
}

const HASH = /^[0-9a-f]{16}$/;
const BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Number of differing bits between two hashes; null when either is not a 16-character hex hash. */
export function hammingDistance(a: string, b: string): number | null {
  if (!HASH.test(a) || !HASH.test(b)) return null;
  let distance = 0;
  for (let i = 0; i < 16; i++) distance += BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return distance;
}

export interface HashedPhoto {
  storage_key: string;
  sha256?: string | null;
  phash?: string | null;
}

export interface ReuseMatch<T extends HashedPhoto> {
  /** The same file, byte for byte. */
  exact: boolean;
  /** Differing bits of the perceptual hash; 0 for an exact match. */
  distance: number;
  match: T;
}

/**
 * The closest earlier photo to `photo`, if any is the same file or within
 * `maxDistance` bits. An identical file wins over a look-alike.
 */
export function findReuse<T extends HashedPhoto>(photo: HashedPhoto, previous: T[], maxDistance: number): ReuseMatch<T> | null {
  let best: ReuseMatch<T> | null = null;
  for (const p of previous) {
    if (p.storage_key === photo.storage_key) continue;
    if (photo.sha256 && p.sha256 && photo.sha256 === p.sha256) return { exact: true, distance: 0, match: p };
    if (!photo.phash || !p.phash) continue;
    const distance = hammingDistance(photo.phash, p.phash);
    if (distance !== null && distance <= maxDistance && (best === null || distance < best.distance)) {
      best = { exact: false, distance, match: p };
    }
  }
  return best;
}
