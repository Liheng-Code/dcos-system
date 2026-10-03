import { describe, expect, it } from "vitest";
import { overlapsNightWindow, suggestOtType, type OtTypeContext, type OtTypeRule } from "../ot-type";

const RULES: OtTypeRule[] = [
  { priority: 10, kind: "public_holiday", params: {}, ot_type: "public_holiday", is_active: true },
  { priority: 20, kind: "rest_day", params: {}, ot_type: "weekend", is_active: true },
  { priority: 30, kind: "night_window", params: { from: "22:00", to: "05:00" }, ot_type: "night_shift", is_active: true },
  { priority: 99, kind: "default", params: {}, ot_type: "weekday", is_active: true },
];
const RATED = new Set(["public_holiday", "weekend", "night_shift", "weekday"]);

function ctx(over: Partial<OtTypeContext> = {}): OtTypeContext {
  return { start: "2026-10-05T18:00", end: "2026-10-05T21:00", isHoliday: false, isRestDay: false, ratedTypes: RATED, ...over };
}

describe("overlapsNightWindow", () => {
  it("detects overlap with a window that wraps midnight", () => {
    expect(overlapsNightWindow(21 * 60, 23 * 60, "22:00", "05:00")).toBe(true); // 21:00-23:00
    expect(overlapsNightWindow(2 * 60, 4 * 60, "22:00", "05:00")).toBe(true); // 02:00-04:00
    expect(overlapsNightWindow(18 * 60, 21 * 60, "22:00", "05:00")).toBe(false);
    expect(overlapsNightWindow(5 * 60, 8 * 60, "22:00", "05:00")).toBe(false);
  });

  it("handles a request that runs past midnight and a same-day window", () => {
    expect(overlapsNightWindow(20 * 60, 26 * 60, "22:00", "05:00")).toBe(true); // 20:00 -> 02:00
    expect(overlapsNightWindow(13 * 60, 15 * 60, "12:00", "14:00")).toBe(true);
    expect(overlapsNightWindow(14 * 60, 16 * 60, "12:00", "14:00")).toBe(false);
  });
});

describe("suggestOtType", () => {
  it("suggests weekday on an ordinary evening", () => {
    expect(suggestOtType(RULES, ctx())?.ot_type).toBe("weekday");
  });

  it("prefers public holiday, then rest day, by priority", () => {
    expect(suggestOtType(RULES, ctx({ isHoliday: true, isRestDay: true }))?.ot_type).toBe("public_holiday");
    expect(suggestOtType(RULES, ctx({ isRestDay: true }))?.ot_type).toBe("weekend");
  });

  it("suggests night shift when the request reaches into the night window", () => {
    expect(suggestOtType(RULES, ctx({ end: "2026-10-05T23:30" }))?.ot_type).toBe("night_shift");
    expect(suggestOtType(RULES, ctx({ start: "2026-10-05T20:00", end: "2026-10-06T02:00" }))?.ot_type).toBe("night_shift");
  });

  it("never suggests a type that has no active rate, falling through to the next rule", () => {
    const noWeekend = new Set(["public_holiday", "night_shift", "weekday"]);
    expect(suggestOtType(RULES, ctx({ isRestDay: true, ratedTypes: noWeekend }))?.ot_type).toBe("weekday");
  });

  it("ignores inactive rules and returns null when nothing applies", () => {
    expect(suggestOtType(RULES.map((r) => ({ ...r, is_active: false })), ctx())).toBeNull();
    expect(suggestOtType(RULES, ctx({ ratedTypes: new Set() }))).toBeNull();
  });

  it("explains the choice", () => {
    expect(suggestOtType(RULES, ctx({ isHoliday: true }))?.reason).toContain("public holiday");
  });
});
