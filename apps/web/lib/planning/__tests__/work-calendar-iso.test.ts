import { describe, expect, it } from "vitest";
import { addCalendarDays, isValidISO, parseISO, toISO } from "../work-calendar";

describe("parseISO / toISO", () => {
  it("round-trips valid dates, including month ends and leap days", () => {
    for (const d of ["2026-10-05", "2026-01-01", "2026-12-31", "2028-02-29", "2027-02-28", "1999-12-31"]) {
      expect(toISO(parseISO(d))).toBe(d);
      expect(parseISO(d).getTime()).toBe(new Date(d + "T00:00:00Z").getTime());
    }
  });
  it("agrees with the original implementation over a wide range", () => {
    const start = Date.UTC(2020, 0, 1);
    for (let i = 0; i < 3000; i++) {
      const d = new Date(start + i * 86_400_000);
      expect(toISO(d)).toBe(d.toISOString().slice(0, 10));
    }
  });
  it("still rejects what it rejected before", () => {
    expect(isValidISO("2028-02-29")).toBe(true);
    expect(isValidISO("2026-13-01")).toBe(false);
    expect(isValidISO("")).toBe(false);
    expect(isValidISO("not-a-date")).toBe(false);
    expect(Number.isNaN(parseISO("garbage").getTime())).toBe(true);
    expect(() => toISO(new Date(NaN))).toThrow(RangeError);
  });
  it("treats an impossible day exactly as the original implementation does", () => {
    for (const d of ["2026-02-31", "2027-02-29", "2026-04-31"]) {
      expect(parseISO(d).getTime()).toBe(new Date(d + "T00:00:00Z").getTime());
    }
  });

  it("does calendar arithmetic as before", () => {
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addCalendarDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(addCalendarDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
