import { describe, expect, it } from "vitest";
import { computeLeaveDays, getDefaultDaySelections, getSelectedDates } from "../leave-day-calculation";

// October 2026: the 4th and 11th are Sundays; the 5th is a Monday.
const MON = "2026-10-05";
const SAT = "2026-10-10";
const SUN = "2026-10-11";
const NEXT_MON = "2026-10-12";

function days(start: string, end: string, overrides = {}, holidays: string[] = []) {
  const holidaySet = new Set(holidays);
  const selections = getDefaultDaySelections(start, end, overrides, holidaySet);
  return computeLeaveDays(start, end, selections, holidaySet);
}

describe("getSelectedDates", () => {
  it("returns every calendar day in the range, inclusive", () => {
    expect(getSelectedDates(MON, SAT)).toHaveLength(6);
    expect(getSelectedDates(MON, MON)).toHaveLength(1);
  });

  it("returns nothing for a missing or reversed range", () => {
    expect(getSelectedDates("", SAT)).toEqual([]);
    expect(getSelectedDates(MON, "")).toEqual([]);
    expect(getSelectedDates(SAT, MON)).toEqual([]);
  });
});

describe("leave day counting", () => {
  it("counts every working day in a Monday-to-Saturday week as a full day", () => {
    expect(days(MON, SAT).daysRequested).toBe(6);
  });

  it("excludes Sundays automatically", () => {
    const result = days(MON, NEXT_MON);
    expect(result.daysRequested).toBe(7);
    expect(result.requestableDateKeys).not.toContain(SUN);
  });

  it("excludes public holidays automatically", () => {
    const result = days(MON, SAT, {}, ["2026-10-07"]);
    expect(result.daysRequested).toBe(5);
    expect(result.requestableDateKeys).not.toContain("2026-10-07");
  });

  it("counts a Sunday or holiday only when the employee explicitly selects it", () => {
    expect(days(MON, NEXT_MON, { [SUN]: "full" }).daysRequested).toBe(8);
    expect(days(MON, SAT, { "2026-10-07": "morning" }, ["2026-10-07"]).daysRequested).toBe(5.5);
  });

  it("counts a morning or afternoon as half a day and a skipped day as zero", () => {
    expect(days(MON, SAT, { "2026-10-06": "morning" }).daysRequested).toBe(5.5);
    expect(days(MON, SAT, { "2026-10-06": "afternoon", "2026-10-07": "skip" }).daysRequested).toBe(4.5);
  });

  it("requests nothing when the range is a single Sunday", () => {
    const result = days(SUN, SUN);
    expect(result.daysRequested).toBe(0);
    expect(result.requestableDateKeys).toEqual([]);
  });
});

describe("half-day flags", () => {
  it("flags a lone half day and reports which half", () => {
    const result = days(MON, MON, { [MON]: "afternoon" });
    expect(result).toMatchObject({
      daysRequested: 0.5,
      isHalfDay: true,
      isSingleHalfDayRequest: true,
      halfDayPeriod: "afternoon",
    });
  });

  it("does not treat a half day inside a longer request as a single half-day request", () => {
    const result = days(MON, SAT, { "2026-10-06": "morning" });
    expect(result.isHalfDay).toBe(true);
    expect(result.isSingleHalfDayRequest).toBe(false);
    expect(result.halfDayPeriod).toBeNull();
  });

  it("reports no half day for full-day requests", () => {
    expect(days(MON, SAT)).toMatchObject({ isHalfDay: false, isSingleHalfDayRequest: false, halfDayPeriod: null });
  });
});
