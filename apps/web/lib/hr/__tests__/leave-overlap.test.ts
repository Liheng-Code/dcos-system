import { describe, expect, it } from "vitest";
import {
  buildOccupiedDayPortions,
  findLeaveDayConflicts,
  formatLeaveDayConflict,
  getRequestDayPortions,
  requestedDaySelections,
  type OccupiedLeaveRequest,
} from "../leave-day-calculation";

// Same cases as the dry run of migration 20261102130533_hr_leave_overlap_guard.sql.
const fullDays: OccupiedLeaveRequest = {
  start_date: "2026-12-14",
  end_date: "2026-12-15",
  day_selections: { "2026-12-14": "full", "2026-12-15": "full" },
};
const morningOnly: OccupiedLeaveRequest = {
  start_date: "2026-12-18",
  end_date: "2026-12-18",
  day_selections: { "2026-12-18": "morning" },
};
const legacy: OccupiedLeaveRequest = { start_date: "2026-12-21", end_date: "2026-12-22" };
const occupied = buildOccupiedDayPortions([fullDays, morningOnly, legacy]);

const conflictDates = (selections: Parameters<typeof findLeaveDayConflicts>[0]) =>
  findLeaveDayConflicts(selections, occupied).map((c) => c.date);

describe("findLeaveDayConflicts", () => {
  it("blocks the same day whatever the leave type", () => {
    expect(conflictDates({ "2026-12-14": "full" })).toEqual(["2026-12-14"]);
  });

  it("reports only the overlapping days of a partial overlap", () => {
    expect(conflictDates({ "2026-12-15": "full", "2026-12-16": "full", "2026-12-17": "full" })).toEqual(["2026-12-15"]);
  });

  it("lets skipped days through", () => {
    expect(conflictDates({ "2026-12-14": "skip", "2026-12-15": "skip", "2026-12-16": "full" })).toEqual([]);
  });

  it("allows the other half of a half-booked day", () => {
    expect(conflictDates({ "2026-12-18": "afternoon" })).toEqual([]);
  });

  it("blocks the same half or a full day on a half-booked day", () => {
    expect(conflictDates({ "2026-12-18": "morning" })).toEqual(["2026-12-18"]);
    expect(conflictDates({ "2026-12-18": "full" })).toEqual(["2026-12-18"]);
  });

  it("treats a legacy request without per-day choices as the whole range", () => {
    expect(conflictDates({ "2026-12-22": "afternoon" })).toEqual(["2026-12-22"]);
  });

  it("allows days with no leave", () => {
    expect(conflictDates({ "2026-12-28": "full" })).toEqual([]);
  });

  it("treats morning + afternoon already taken as a full day", () => {
    const both = buildOccupiedDayPortions([
      morningOnly,
      { start_date: "2026-12-18", end_date: "2026-12-18", is_half_day: true, half_day_period: "afternoon" },
    ]);
    expect(findLeaveDayConflicts({ "2026-12-18": "afternoon" }, both)).toEqual([{ date: "2026-12-18", taken: "full" }]);
  });
});

describe("getRequestDayPortions", () => {
  it("uses the single half day of a legacy half-day request", () => {
    const portions = getRequestDayPortions({ start_date: "2026-12-18", end_date: "2026-12-18", is_half_day: true, half_day_period: "morning" });
    expect([...portions]).toEqual([["2026-12-18", "morning"]]);
  });

  it("ignores days absent from or skipped in the saved choices", () => {
    const portions = getRequestDayPortions({
      start_date: "2026-12-12",
      end_date: "2026-12-14",
      day_selections: { "2026-12-12": "full", "2026-12-14": "skip" },
    });
    expect([...portions.keys()]).toEqual(["2026-12-12"]);
  });
});

describe("formatting and saving", () => {
  it("labels half-booked days", () => {
    expect(formatLeaveDayConflict({ date: "2026-12-14", taken: "full" })).toBe("14 Dec 2026");
    expect(formatLeaveDayConflict({ date: "2026-12-18", taken: "morning" })).toBe("18 Dec 2026 (morning already taken)");
  });

  it("saves only requested days", () => {
    expect(requestedDaySelections({ "2026-12-14": "skip", "2026-12-15": "morning", "2026-12-16": "full" }))
      .toEqual({ "2026-12-15": "morning", "2026-12-16": "full" });
  });
});
