import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "../work-calendar";
import {
  ALL_DAYS_CALENDAR,
  computeStepDays,
  needsRespread,
  rebalanceWeights,
  resolveActivityDuration,
  spreadSteps,
  type SpreadStep,
} from "../activity-step-spread";

const cal = DEFAULT_CALENDAR; // Mon–Sat. 2026-10-05 is a Monday, 2026-10-11 a Sunday.

// "Blockwork / Masonry – Typical Floor" as converted by 20261020000001.
function blockwork(): SpreadStep[] {
  const s = (id: string, basis: "fixed" | "scaled", value: number): SpreadStep => ({
    id,
    duration_basis: basis,
    duration_share_pct: basis === "scaled" ? value : null,
    est_duration_days: basis === "fixed" ? value : null,
    progress: 0,
    start_date: null,
    end_date: null,
  });
  return [
    s("setting-out", "fixed", 1),
    s("dpc", "scaled", 25),
    s("laying", "scaled", 25),
    s("ties", "scaled", 33.3),
    s("pointing", "scaled", 16.7),
    s("inspection", "fixed", 0.5),
  ];
}

describe("computeStepDays", () => {
  it("gives fixed steps their own days and shares the rest among scaled steps", () => {
    const r = computeStepDays(blockwork(), 10);
    expect(r.fixedDays).toBe(1.5);
    expect(r.scaledDays).toBe(8.5);
    expect(r.days.get("setting-out")).toBe(1);
    expect(r.days.get("inspection")).toBe(0.5);
    expect(r.days.get("dpc")).toBeCloseTo(2.125);
    const total = [...r.days.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(10);
  });

  it("follows the quantity: doubling the activity doubles only the scaled time", () => {
    const r = computeStepDays(blockwork(), 20);
    expect(r.days.get("setting-out")).toBe(1);
    expect(r.days.get("inspection")).toBe(0.5);
    expect(r.scaledDays).toBe(18.5);
    expect(r.days.get("dpc")).toBeCloseTo(18.5 * 0.25);
  });

  it("splits equally when no scaled step has a share", () => {
    const steps = blockwork().map((s) => (s.duration_basis === "scaled" ? { ...s, duration_share_pct: null } : s));
    const r = computeStepDays(steps, 9.5);
    expect(r.days.get("dpc")).toBe(2);
    expect(r.days.get("pointing")).toBe(2);
  });
});

describe("spreadSteps", () => {
  it("lays steps back to back and ends on the activity's last working day", () => {
    const r = spreadSteps(blockwork(), 10, "2026-10-05", cal);
    expect(r.warnings).toEqual([]);
    const by = new Map(r.updates.map((u) => [u.id, u]));
    expect(by.get("setting-out")).toMatchObject({ start_date: "2026-10-05", end_date: "2026-10-05", est_duration_days: 1 });
    expect(by.get("dpc")).toMatchObject({ start_date: "2026-10-06", end_date: "2026-10-08", est_duration_days: 2.1 });
    // Skips Sunday 2026-10-11.
    expect(by.get("ties")).toMatchObject({ start_date: "2026-10-10", end_date: "2026-10-14" });
    // 10 working days from Mon 5 Oct end on Thu 15 Oct.
    expect(by.get("inspection")).toMatchObject({ start_date: "2026-10-15", end_date: "2026-10-15", est_duration_days: 0.5 });
  });

  it("returns days only when the activity has no start", () => {
    const r = spreadSteps(blockwork(), 10, null, cal);
    expect(r.updates.every((u) => u.start_date === null && u.end_date === null)).toBe(true);
    expect(r.updates.find((u) => u.id === "laying")?.est_duration_days).toBe(2.1);
  });

  it("uses every day for calendar-day activities", () => {
    const r = spreadSteps(blockwork(), 10, "2026-10-05", ALL_DAYS_CALENDAR);
    expect(r.updates.at(-1)?.end_date).toBe("2026-10-14");
  });

  it("leaves started steps alone and lays the rest out after them", () => {
    const steps = blockwork();
    steps[0] = { ...steps[0], progress: 100, start_date: "2026-10-05", end_date: "2026-10-06", est_duration_days: 1 };
    const r = spreadSteps(steps, 10, "2026-10-05", cal);
    expect(r.updates.map((u) => u.id)).not.toContain("setting-out");
    expect(r.updates[0]).toMatchObject({ id: "dpc", start_date: "2026-10-07" });
    expect(r.warnings[0]).toMatch(/in progress/);
  });

  it("warns when fixed steps alone exceed the activity", () => {
    const r = spreadSteps(blockwork(), 1, "2026-10-05", cal);
    expect(r.scaledDays).toBe(0);
    expect(r.warnings[0]).toMatch(/Fixed steps take 1.5 d/);
  });
});

describe("needsRespread", () => {
  it("is false right after a spread and true once the activity duration changes", () => {
    const steps = blockwork();
    const spread = new Map(spreadSteps(steps, 10, null, cal).updates.map((u) => [u.id, u.est_duration_days]));
    const stored = steps.map((s) => ({ ...s, est_duration_days: spread.get(s.id) ?? s.est_duration_days }));
    expect(needsRespread(stored, 10)).toBe(false);
    expect(needsRespread(stored, 12)).toBe(true);
  });
});

describe("resolveActivityDuration", () => {
  const work = { quantity: 400, quantity_unit: "m2", duration_wd_derived: 12, norm_code: "CUST-ARC-01" };

  it("uses Task Work's quantity-derived duration when there is one", () => {
    expect(resolveActivityDuration(10, "wd", work)).toMatchObject({ days: 12, source: "quantity", scheduledDays: 10, quantity: 400 });
  });

  it("falls back to the scheduled duration", () => {
    expect(resolveActivityDuration(10, "wd", null)).toMatchObject({ days: 10, source: "schedule" });
    expect(resolveActivityDuration(10, "wd", { ...work, duration_wd_derived: null })).toMatchObject({ source: "schedule" });
    expect(resolveActivityDuration(10, "cd", work)).toMatchObject({ days: 10, source: "schedule" });
  });
});

describe("rebalanceWeights", () => {
  it("keeps proportions and totals 100", () => {
    expect(rebalanceWeights([20, 20, 10])).toEqual([40, 40, 20]);
    const w = rebalanceWeights([1, 1, 1]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(w).toEqual([33.34, 33.33, 33.33]);
  });
  it("shares equally when nothing has weight", () => {
    expect(rebalanceWeights([0, 0])).toEqual([50, 50]);
    expect(rebalanceWeights([])).toEqual([]);
  });
});
