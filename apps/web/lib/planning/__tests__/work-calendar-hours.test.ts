import { describe, expect, it } from "vitest";
import {
  buildWorkCalendar,
  DEFAULT_CALENDAR,
  DEFAULT_HOURS_PER_DAY,
  hoursPerDayOf,
  type PlanCalendarRow,
} from "../work-calendar";

const row = (over: Partial<PlanCalendarRow> = {}): PlanCalendarRow => ({
  id: "c1",
  name: "Project calendar",
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: false,
  ...over,
});

describe("calendar hours per day", () => {
  it("defaults to 8 when the row does not carry the column (older selects)", () => {
    expect(hoursPerDayOf(buildWorkCalendar(row(), []))).toBe(DEFAULT_HOURS_PER_DAY);
    expect(DEFAULT_HOURS_PER_DAY).toBe(8);
  });

  it("uses the calendar's hours_per_day", () => {
    expect(hoursPerDayOf(buildWorkCalendar(row({ hours_per_day: 10 }), []))).toBe(10);
    // numeric columns can arrive as strings from PostgREST
    expect(hoursPerDayOf(buildWorkCalendar(row({ hours_per_day: "7.5" as unknown as number }), []))).toBe(7.5);
  });

  it("ignores nonsense values instead of dividing by zero later", () => {
    expect(hoursPerDayOf(buildWorkCalendar(row({ hours_per_day: 0 }), []))).toBe(8);
    expect(hoursPerDayOf(buildWorkCalendar(row({ hours_per_day: -3 }), []))).toBe(8);
    expect(hoursPerDayOf(buildWorkCalendar(row({ hours_per_day: null }), []))).toBe(8);
    expect(hoursPerDayOf({ ...DEFAULT_CALENDAR, hoursPerDay: Number.NaN })).toBe(8);
  });

  it("keeps the built-in Mon–Fri fallback at 8 hours", () => {
    expect(hoursPerDayOf(buildWorkCalendar(null, []))).toBe(8);
  });

  it("does not change which days are working", () => {
    const cal = buildWorkCalendar(row({ hours_per_day: 10 }), []);
    // Mon–Sat, Sunday off — index by getUTCDay(): 0 = Sunday
    expect(cal.workdays).toEqual([false, true, true, true, true, true, true]);
  });
});
