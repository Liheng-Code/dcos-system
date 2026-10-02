import { describe, expect, it } from "vitest";
import {
  calculateWeightedProgress,
  deriveActivityStatus,
  calculateTotalHours,
  calculateProductivityRate,
  isExcusableDelay,
  validateDailyReportPayload,
} from "../daily-report-math";
import type {
  DailyReportActivityInput,
  DelayCategory,
  SiteDailyReport,
  StepProgressItem,
} from "../daily-report-service";

describe("Daily Report & Planning Integration - Calculations & Governance", () => {
  describe("calculateWeightedProgress", () => {
    it("computes weighted progress correctly when step weights sum to 100%", () => {
      const steps: StepProgressItem[] = [
        { step_id: "s1", step_no: 1, step_name: "Rebar & Formwork", weight: 30, progress: 100 },
        { step_id: "s2", step_no: 2, step_name: "Concrete Pouring", weight: 40, progress: 50 },
        { step_id: "s3", step_no: 3, step_name: "Curing & De-shuttering", weight: 30, progress: 0 },
      ];

      // (100 * 30 + 50 * 40 + 0 * 30) / 100 = (3000 + 2000 + 0) / 100 = 50%
      const prog = calculateWeightedProgress(steps);
      expect(prog).toBe(50);
    });

    it("handles arbitrary weights proportionally", () => {
      const steps: StepProgressItem[] = [
        { step_id: "s1", step_no: 1, step_name: "Trench excavation", weight: 2, progress: 100 },
        { step_id: "s2", step_no: 2, step_name: "Pipe laying", weight: 6, progress: 50 },
      ];

      // (100 * 2 + 50 * 6) / (2 + 6) = (200 + 300) / 8 = 500 / 8 = 62.5%
      const prog = calculateWeightedProgress(steps);
      expect(prog).toBe(62.5);
    });

    it("falls back to unweighted arithmetic mean if all weights are zero", () => {
      const steps: StepProgressItem[] = [
        { step_id: "s1", step_no: 1, step_name: "Step A", weight: 0, progress: 80 },
        { step_id: "s2", step_no: 2, step_name: "Step B", weight: 0, progress: 40 },
      ];

      // (80 + 40) / 2 = 60%
      const prog = calculateWeightedProgress(steps);
      expect(prog).toBe(60);
    });

    it("returns 0 if steps list is empty", () => {
      expect(calculateWeightedProgress([])).toBe(0);
    });

    it("clamps values between 0 and 100 and rounds to 2 decimal places", () => {
      const steps: StepProgressItem[] = [
        { step_id: "s1", step_no: 1, step_name: "Step 1", weight: 3, progress: 33.3333 },
        { step_id: "s2", step_no: 2, step_name: "Step 2", weight: 3, progress: 66.6666 },
      ];
      const prog = calculateWeightedProgress(steps);
      expect(prog).toBe(50);
    });
  });

  describe("deriveActivityStatus", () => {
    it("returns 'completed' when progress reaches 100%", () => {
      expect(deriveActivityStatus(100, false)).toBe("completed");
      expect(deriveActivityStatus(100, true)).toBe("completed"); // Completion takes precedence
    });

    it("returns 'hindered' when progress < 100% and delay is flagged", () => {
      expect(deriveActivityStatus(65, true)).toBe("hindered");
      expect(deriveActivityStatus(0, true)).toBe("hindered");
    });

    it("returns 'in_progress' when progress is between 0% and 100% without delay", () => {
      expect(deriveActivityStatus(25, false)).toBe("in_progress");
      expect(deriveActivityStatus(99.9, false)).toBe("in_progress");
    });

    it("returns 'not_started' when progress is 0% without delay", () => {
      expect(deriveActivityStatus(0, false)).toBe("not_started");
    });
  });

  describe("calculateTotalHours & calculateProductivityRate", () => {
    it("computes total crew man-hours accurately", () => {
      // 5 workers * (8 regular hours + 2 OT hours) = 5 * 10 = 50 man-hours
      const hours = calculateTotalHours(5, 8, 2);
      expect(hours).toBe(50);
    });

    it("handles zero or null headcounts gracefully", () => {
      expect(calculateTotalHours(0, 8, 0)).toBe(0);
      expect(calculateTotalHours(null, 8, 0)).toBe(0);
    });

    it("computes productivity output rate (units per man-hour)", () => {
      // 120 m3 poured in 50 man-hours = 2.4 m3/man-hr
      const rate = calculateProductivityRate(120, 50);
      expect(rate).toBe(2.4);
    });

    it("returns null when total man-hours are 0 or quantity is missing", () => {
      expect(calculateProductivityRate(100, 0)).toBeNull();
      expect(calculateProductivityRate(null, 40)).toBeNull();
    });
  });

  describe("isExcusableDelay (Delay Register Linkage)", () => {
    it("identifies employer/third-party events as excusable delays", () => {
      const excusable: DelayCategory[] = ["weather", "client", "rfi_design"];
      for (const cat of excusable) {
        expect(isExcusableDelay(cat)).toBe(true);
      }
    });

    it("identifies contractor default events as non-excusable delays", () => {
      const nonExcusable: DelayCategory[] = ["subcontractor", "material", "labor", "safety", "other"];
      for (const cat of nonExcusable) {
        expect(isExcusableDelay(cat)).toBe(false);
      }
    });

    it("returns false for null/undefined category", () => {
      expect(isExcusableDelay(null)).toBe(false);
      expect(isExcusableDelay(undefined)).toBe(false);
    });
  });

  describe("validateDailyReportPayload", () => {
    const validReport: Partial<SiteDailyReport> = {
      report_date: "2026-09-28",
    };

    const validActivity: DailyReportActivityInput = {
      task_id: "11111111-2222-3333-4444-555555555555",
      progress_today: 45,
      has_delay: false,
    };

    it("passes validation with well-formed report and activity", () => {
      const result = validateDailyReportPayload(validReport, [validActivity]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when report_date is missing or ill-formed", () => {
      const res1 = validateDailyReportPayload({ report_date: "" }, [validActivity]);
      expect(res1.valid).toBe(false);
      expect(res1.errors[0]).toMatch(/valid report date/i);

      const res2 = validateDailyReportPayload({ report_date: "28-09-2026" }, [validActivity]);
      expect(res2.valid).toBe(false);
    });

    it("fails when no activities are provided", () => {
      const res = validateDailyReportPayload(validReport, []);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toMatch(/at least one activity/i);
    });

    it("fails when activity progress is out of bounds (>100 or <0)", () => {
      const invalidAct: DailyReportActivityInput = {
        ...validActivity,
        progress_today: 120,
      };
      const res = validateDailyReportPayload(validReport, [invalidAct]);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toMatch(/between 0% and 100%/i);
    });

    it("enforces delay reason and category if has_delay is flagged", () => {
      const delayedWithoutDetails: DailyReportActivityInput = {
        ...validActivity,
        has_delay: true,
        delay_reason: "",
        delay_category: null,
      };
      const res = validateDailyReportPayload(validReport, [delayedWithoutDetails]);
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThanOrEqual(2);
      expect(res.errors.some((e) => e.includes("reason"))).toBe(true);
      expect(res.errors.some((e) => e.includes("category"))).toBe(true);
    });
  });

  describe("End-to-End Site Diary to Planning Sync simulation", () => {
    it("simulates direct sync vs review queue routing based on governance flags", () => {
      interface MockTask {
        id: string;
        progress: number;
        status: string;
      }

      function simulateProgressSubmission(
        task: MockTask,
        proposedProgress: number,
        governanceEnabled: boolean
      ) {
        if (!governanceEnabled) {
          // Direct sync mode
          task.progress = proposedProgress;
          task.status = proposedProgress === 100 ? "closed" : proposedProgress > 0 ? "in_progress" : "open";
          return { mode: "direct" as const, review_id: null };
        } else {
          // Pending review queue mode
          const reviewId = "rev-999";
          return { mode: "pending" as const, review_id: reviewId };
        }
      }

      // Case 1: Direct sync (governance disabled)
      const taskA: MockTask = { id: "t1", progress: 20, status: "in_progress" };
      const resA = simulateProgressSubmission(taskA, 75, false);
      expect(resA.mode).toBe("direct");
      expect(taskA.progress).toBe(75);

      // Case 2: Governance enabled (queued for planner review)
      const taskB: MockTask = { id: "t2", progress: 20, status: "in_progress" };
      const resB = simulateProgressSubmission(taskB, 80, true);
      expect(resB.mode).toBe("pending");
      expect(resB.review_id).toBe("rev-999");
      expect(taskB.progress).toBe(20); // Task progress untouched until planner confirms
    });

    it("builds correct productivity log payload from daily report activity", () => {
      const activity: DailyReportActivityInput = {
        task_id: "task-001",
        trade_code: "Masonry",
        progress_today: 60,
        quantity_done: 45.5,
        quantity_unit: "m2",
        headcount: 4,
        hours_normal: 8,
        hours_ot: 1,
        work_description: "Completed bricklaying on grid A-C",
      };

      const totalManHours = calculateTotalHours(activity.headcount, activity.hours_normal, activity.hours_ot);
      const prodRate = calculateProductivityRate(activity.quantity_done, totalManHours);

      expect(totalManHours).toBe(36); // 4 * 9
      expect(prodRate).toBe(1.2639); // 45.5 / 36

      const productivityLogRow = {
        task_id: activity.task_id,
        trade_code: activity.trade_code,
        headcount: activity.headcount,
        hours_normal: activity.hours_normal,
        hours_ot: activity.hours_ot,
        quantity_done: activity.quantity_done,
        unit: activity.quantity_unit,
        condition_note: activity.work_description,
        source: "site_diary",
      };

      expect(productivityLogRow.source).toBe("site_diary");
      expect(productivityLogRow.quantity_done).toBe(45.5);
    });

    it("builds correct delay register row from daily report activity", () => {
      const activity: DailyReportActivityInput = {
        task_id: "task-002",
        trade_code: "Piling",
        progress_today: 10,
        has_delay: true,
        delay_reason: "Heavy monsoon rain flooding basement excavation",
        delay_category: "weather",
        delay_hours_lost: 4.5,
      };

      const delayRegisterRow = {
        wbs_task_id: activity.task_id,
        description: activity.delay_reason,
        delay_type: isExcusableDelay(activity.delay_category) ? "excusable" : "non_excusable",
        cause: activity.delay_category,
        responsible_party: activity.trade_code,
        status: "open",
      };

      expect(delayRegisterRow.delay_type).toBe("excusable");
      expect(delayRegisterRow.cause).toBe("weather");
      expect(delayRegisterRow.status).toBe("open");
    });
  });
});
