import { describe, expect, it } from "vitest";
import {
  bandForAmount,
  poBandAmount,
  requiredBand,
  userMaxBand,
  validateBands,
  type ApprovalBand,
} from "../approval-bands";

const bands: ApprovalBand[] = [
  { band: 1, label: "Band 1", min_amount: 0, max_amount: 1000, permission_action: "po_band1" },
  { band: 2, label: "Band 2", min_amount: 1000, max_amount: 10000, permission_action: "po_band2" },
  { band: 3, label: "Band 3", min_amount: 10000, max_amount: 50000, permission_action: "po_band3" },
  { band: 4, label: "Band 4", min_amount: 50000, max_amount: 250000, permission_action: "po_band4" },
  { band: 5, label: "Band 5", min_amount: 250000, max_amount: null, permission_action: "po_band5" },
];

describe("bandForAmount (min < amount <= max, band 1 includes 0)", () => {
  it.each([
    [0, 1], [0.01, 1], [1000, 1], [1000.01, 2], [10000, 2], [10000.01, 3],
    [50000, 3], [50000.01, 4], [250000, 4], [250000.01, 5], [99999999, 5],
  ])("%s is band %s", (amount, band) => {
    expect(bandForAmount(amount, bands)).toBe(band);
  });
  it("is independent of array order", () => {
    expect(bandForAmount(5000, [...bands].reverse())).toBe(2);
  });
  it("falls back to the top band for an amount no band holds", () => {
    expect(bandForAmount(-1, bands)).toBe(5);
  });
});

describe("requiredBand", () => {
  it("equals the amount band without uplift", () => {
    expect(requiredBand(5000, bands, false)).toBe(2);
  });
  it("adds one band with an uplift", () => {
    expect(requiredBand(5000, bands, true)).toBe(3);
    expect(requiredBand(0, bands, true)).toBe(2);
  });
  it("caps at band 5", () => {
    expect(requiredBand(250000, bands, true)).toBe(5);
    expect(requiredBand(900000, bands, true)).toBe(5);
  });
});

describe("userMaxBand", () => {
  const holds = (...actions: string[]) => (resource: string, field: string) =>
    field === "approve" && actions.includes(resource);
  it("is the highest band held", () => {
    expect(userMaxBand(holds("po_band3"), bands)).toBe(3);
    expect(userMaxBand(holds("po_band1", "po_band4"), bands)).toBe(4);
  });
  it("is 0 when no band is held", () => {
    expect(userMaxBand(() => false, bands)).toBe(0);
  });
  it("asks for the approve field only", () => {
    const seen: string[] = [];
    userMaxBand((_r, f) => { seen.push(f); return false; }, bands);
    expect(new Set(seen)).toEqual(new Set(["approve"]));
  });
  it("is 0 with no bands loaded", () => {
    expect(userMaxBand(() => true, [])).toBe(0);
  });
});

describe("validateBands (mirrors proc_validate_bands)", () => {
  const edit = (fn: (b: ApprovalBand[]) => void) => {
    const copy = bands.map((b) => ({ ...b }));
    fn(copy);
    return validateBands(copy);
  };

  it("accepts the default bands", () => {
    expect(validateBands(bands)).toBeNull();
  });
  it("accepts moved boundaries that stay contiguous", () => {
    expect(edit((b) => { b[0].max_amount = 2000; b[1].min_amount = 2000; })).toBeNull();
  });
  it("rejects a gap", () => {
    expect(edit((b) => { b[1].min_amount = 1500; })).toMatch(/band 2 must start where band 1 ends \(1000\)/i);
  });
  it("rejects an overlap", () => {
    expect(edit((b) => { b[2].min_amount = 9000; })).toMatch(/band 3 must start/i);
  });
  it("requires band 1 to start at 0", () => {
    expect(edit((b) => { b[0].min_amount = 10; })).toMatch(/band 1 must start at 0/i);
  });
  it("rejects a negative minimum", () => {
    expect(edit((b) => { b[0].min_amount = -5; })).toMatch(/minimum of 0/i);
  });
  it("rejects a maximum not above the minimum", () => {
    expect(edit((b) => { b[1].max_amount = 1000; b[2].min_amount = 1000; })).toMatch(/band 2 needs a maximum above/i);
  });
  it("rejects a missing maximum below band 5", () => {
    expect(edit((b) => { b[3].max_amount = null; })).toMatch(/band 4 needs a maximum/i);
  });
  it("rejects a maximum on band 5", () => {
    expect(edit((b) => { b[4].max_amount = 999999; })).toMatch(/band 5 has no maximum/i);
  });
  it("rejects too few or non-sequential bands", () => {
    expect(validateBands(bands.slice(0, 4))).toMatch(/exactly 5/i);
    expect(edit((b) => { b[2].band = 7; })).toMatch(/numbered 1 to 5/i);
    expect(validateBands([])).toMatch(/exactly 5/i);
  });
  it("rejects non-finite numbers", () => {
    expect(edit((b) => { b[1].min_amount = Number.NaN; })).toMatch(/minimum of 0/i);
  });
});

describe("poBandAmount (greatest of grand_total, total_amount, line sum)", () => {
  it("takes the greatest of the three", () => {
    expect(poBandAmount({ grand_total: 100, total_amount: 90 }, [{ total_price: 50 }, { total_price: 40 }])).toBe(100);
    expect(poBandAmount({ grand_total: 100, total_amount: 90 }, [{ total_price: 80 }, { total_price: 70 }])).toBe(150);
    expect(poBandAmount({ grand_total: 10, total_amount: 120 }, [{ total_price: 5 }])).toBe(120);
  });
  it("ignores nulls like SQL greatest", () => {
    expect(poBandAmount({ grand_total: null, total_amount: 70 }, [])).toBe(70);
    expect(poBandAmount({}, [{ total_price: null }, { total_price: 30 }])).toBe(30);
  });
  it("is 0 when nothing is known", () => {
    expect(poBandAmount({}, [])).toBe(0);
  });
});
