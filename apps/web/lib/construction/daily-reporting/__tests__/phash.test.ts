import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { dhashFromGray, findReuse, hammingDistance, PHASH_HEIGHT, PHASH_WIDTH } from "../phash";
import { perceptualHash, photoReuseResults } from "../server";
import type { RuleDefinition } from "../types";

const grid = (fn: (row: number, col: number) => number) =>
  Uint8Array.from({ length: PHASH_WIDTH * PHASH_HEIGHT }, (_, i) => fn(Math.floor(i / PHASH_WIDTH), i % PHASH_WIDTH));

describe("difference hash", () => {
  it("sets a bit where a pixel is brighter than its right neighbour", () => {
    expect(dhashFromGray(grid((_, col) => 200 - col * 10))).toBe("ffffffffffffffff");
    expect(dhashFromGray(grid((row, col) => (row === 0 ? 200 - col * 10 : col * 10)))).toBe("ff00000000000000");
  });

  it("gives no hash to an image with no contrast, or to too few pixels", () => {
    expect(dhashFromGray(grid(() => 128))).toBeNull();
    expect(dhashFromGray(new Uint8Array(10))).toBeNull();
  });

  it("counts differing bits", () => {
    expect(hammingDistance("ffffffffffffffff", "ffffffffffffffff")).toBe(0);
    expect(hammingDistance("ffffffffffffffff", "fffffffffffffff0")).toBe(4);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistance("ffff", "ffffffffffffffff")).toBeNull();
    expect(hammingDistance("zzzzzzzzzzzzzzzz", "ffffffffffffffff")).toBeNull();
  });
});

describe("finding a reused photo", () => {
  const previous = [
    { storage_key: "p/u/old-1.jpg", sha256: "aaa", phash: "ffffffffffffffff" },
    { storage_key: "p/u/old-2.jpg", sha256: "bbb", phash: "ffffffffffffff00" },
    { storage_key: "p/u/old-3.pdf", sha256: "ccc", phash: null },
  ];

  it("an identical file is an exact match, even without a perceptual hash", () => {
    expect(findReuse({ storage_key: "p/u/new.pdf", sha256: "ccc", phash: null }, previous, 5)).toMatchObject({
      exact: true,
      distance: 0,
      match: { storage_key: "p/u/old-3.pdf" },
    });
  });

  it("a look-alike within the distance matches the closest photo", () => {
    expect(findReuse({ storage_key: "p/u/new.jpg", sha256: "zzz", phash: "fffffffffffffffe" }, previous, 5)).toMatchObject({
      exact: false,
      distance: 1,
      match: { storage_key: "p/u/old-1.jpg" },
    });
  });

  it("a different photo, or one beyond the distance, does not match", () => {
    expect(findReuse({ storage_key: "p/u/new.jpg", sha256: "zzz", phash: "0f0f0f0f0f0f0f0f" }, previous, 5)).toBeNull();
    expect(findReuse({ storage_key: "p/u/new.jpg", sha256: "zzz", phash: "ffffffffffffff00" }, [previous[0]], 5)).toBeNull();
    expect(findReuse({ storage_key: "p/u/new.jpg", sha256: "zzz", phash: null }, previous, 5)).toBeNull();
  });

  it("a photo is never matched with itself", () => {
    expect(findReuse(previous[0], previous, 0)).toBeNull();
  });
});

/** A synthetic "site photo": blocks of different brightness, so it has structure to hash. */
async function picture(seed: number, width = 640, height = 480): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const block = Math.floor(x / 80) * 7 + Math.floor(y / 60) * 13 + seed * 31;
      const v = (block * 37) % 256;
      raw.fill(v, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

describe("perceptual hash of real image files", () => {
  it("a recompressed, resized copy hashes almost the same; another photo does not", async () => {
    const original = await picture(1);
    const copy = await sharp(original).resize(320, 240).jpeg({ quality: 40 }).toBuffer();
    const asPng = await sharp(original).png().toBuffer();
    const other = await picture(2);

    const [h, hCopy, hPng, hOther] = await Promise.all([
      perceptualHash(original, "image/jpeg"),
      perceptualHash(copy, "image/jpeg"),
      perceptualHash(asPng, "image/png"),
      perceptualHash(other, "image/jpeg"),
    ]);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(hammingDistance(h as string, hCopy as string)).toBeLessThanOrEqual(5);
    expect(hammingDistance(h as string, hPng as string)).toBeLessThanOrEqual(5);
    expect(hammingDistance(h as string, hOther as string)).toBeGreaterThan(5);
  });

  it("gives no hash to a PDF or to bytes that are not an image, and does not throw", async () => {
    expect(await perceptualHash(Buffer.from("%PDF-1.7"), "application/pdf")).toBeNull();
    expect(await perceptualHash(Buffer.from("not an image"), "image/jpeg")).toBeNull();
  });
});

describe("PHOTO_REUSE", () => {
  const PROJECT = "44444444-4444-4444-8444-444444444444";
  const UNIT = "55555555-5555-4555-8555-555555555555";
  const unit = { id: UNIT, project_id: PROJECT };
  const RULE: RuleDefinition = {
    rule_code: "PHOTO_REUSE",
    point: "POST_SUBMIT",
    severity: "WARNING",
    params: { max_distance: 5, lookback_days: 60 },
    version: 2,
    is_active: true,
    project_id: null,
  };
  const rows = [
    { storage_key: `${PROJECT}/${UNIT}/old.jpg`, report_id: "r-old", sha256: "aaa", phash: "ffffffffffffffff", dr_reports: { report_no: "DR-2026-000007", report_date: "2026-10-01" } },
    { storage_key: `${PROJECT}/${UNIT}/same-report.jpg`, report_id: "r-now", sha256: "bbb", phash: "0f0f0f0f0f0f0f0f", dr_reports: { report_no: "DR-2026-000009", report_date: "2026-10-03" } },
  ];

  /** The one query the check makes; records the filters it was given. */
  function fakeAdmin(data: unknown, fail = false) {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "like", "gte", "order"]) {
      chain[m] = (...args: unknown[]) => {
        filters[m] = args;
        return chain;
      };
    }
    chain.limit = () => (fail ? Promise.reject(new Error("db down")) : Promise.resolve({ data }));
    return { admin: { from: () => chain } as never, filters };
  }

  const photo = (over: Record<string, unknown>) => ({
    storage_key: `${PROJECT}/${UNIT}/new.jpg`,
    target_section: "activities" as const,
    target_line_id: "a1",
    sha256: "zzz",
    phash: "fffffffffffffffe",
    ...over,
  });

  it("warns when a new photo looks the same as one on an earlier report of the unit", async () => {
    const { admin, filters } = fakeAdmin(rows);
    const results = await photoReuseResults(admin, unit, [RULE], [photo({})], "r-now");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      rule_code: "PHOTO_REUSE",
      rule_version: 2,
      severity: "WARNING",
      message: "An attached photo looks the same as one attached to DR-2026-000007 (2026-10-01).",
      target: { section: "activities", line_id: "a1" },
      params: { exact: false, distance: 1, matched_report_id: "r-old" },
    });
    // Only this unit's files are compared.
    expect(filters.like).toEqual(["storage_key", `${PROJECT}/${UNIT}/%`]);
  });

  it("says so when it is the very same file", async () => {
    const { admin } = fakeAdmin(rows);
    const [r] = await photoReuseResults(admin, unit, [RULE], [photo({ sha256: "aaa", phash: null })], null);
    expect(r.message).toBe("An attached file is identical to one attached to DR-2026-000007 (2026-10-01).");
  });

  it("ignores photos of the report being submitted and files carried forward from it", async () => {
    const { admin } = fakeAdmin(rows);
    expect(await photoReuseResults(admin, unit, [RULE], [photo({ phash: "0f0f0f0f0f0f0f0f" })], "r-now")).toEqual([]);
    // Carried-forward evidence has no fresh hash and is not checked again.
    expect(await photoReuseResults(admin, unit, [RULE], [photo({ sha256: undefined })], null)).toEqual([]);
  });

  it("does nothing when the rule is switched off, and never throws", async () => {
    expect(await photoReuseResults(fakeAdmin(rows).admin, unit, [], [photo({})], null)).toEqual([]);
    expect(await photoReuseResults(fakeAdmin(rows, true).admin, unit, [RULE], [photo({})], null)).toEqual([]);
  });
});
