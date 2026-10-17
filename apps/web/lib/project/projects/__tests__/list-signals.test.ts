import { describe, expect, it } from "vitest";
import { countBy, daysUntil, liveSignals, tenderSignals } from "@/lib/project/projects/list-signals";

const TODAY = "2026-10-14";

describe("daysUntil", () => {
  it("counts calendar days either way", () => {
    expect(daysUntil("2026-10-14", TODAY)).toBe(0);
    expect(daysUntil("2026-10-21T09:00:00Z", TODAY)).toBe(7);
    expect(daysUntil("2026-10-10", TODAY)).toBe(-4);
    expect(daysUntil("2026-11-01", TODAY)).toBe(18);
  });
});

describe("tenderSignals", () => {
  it("counts down to the submission deadline", () => {
    const s = tenderSignals({ tender_stage: "tendering", submission_deadline: "2026-10-20T03:00:00Z" }, TODAY);
    expect(s.stage.label).toBe("Tendering");
    expect(s.health).toEqual({ label: "Due in 6 days", tone: "warn" });
    expect(s.deadline?.label).toBe("Submission");
  });

  it("is calm when the deadline is more than a week away, red once it has passed", () => {
    expect(tenderSignals({ tender_stage: "opportunity", submission_deadline: "2026-11-30" }, TODAY).health.tone).toBe("good");
    expect(tenderSignals({ tender_stage: "go_no_go", submission_deadline: "2026-10-12" }, TODAY).health).toEqual({ label: "Deadline passed 2 days ago", tone: "bad" });
    expect(tenderSignals({ tender_stage: "go_no_go", submission_deadline: "2026-10-15" }, TODAY).health.label).toBe("Due tomorrow");
  });

  it("stops counting once submitted or closed", () => {
    expect(tenderSignals({ tender_stage: "submitted", submission_deadline: "2026-10-01" }, TODAY).health.label).toBe("Awaiting result");
    const awarded = tenderSignals({ tender_stage: "awarded", submission_deadline: "2026-10-01" }, TODAY);
    expect([awarded.stage.tone, awarded.health.label, awarded.deadline]).toEqual(["good", "Closed", null]);
  });

  it("flags a tender without details or deadline", () => {
    expect(tenderSignals(null, TODAY).stage.label).toBe("Not registered");
    expect(tenderSignals({ tender_stage: "opportunity", submission_deadline: null }, TODAY).health.label).toBe("No deadline");
  });
});

describe("liveSignals", () => {
  it("is on track with nothing overdue", () => {
    const s = liveSignals({ project_status: "active", end_date: "2027-06-30" }, 0, TODAY);
    expect([s.stage.label, s.health.label, s.deadline?.label]).toEqual(["Active", "On track", "Finish"]);
  });

  it("counts overdue tasks, red from ten", () => {
    expect(liveSignals({ project_status: "active", end_date: null }, 1, TODAY).health).toEqual({ label: "1 overdue task", tone: "warn" });
    expect(liveSignals({ project_status: "active", end_date: null }, 17, TODAY).health.tone).toBe("bad");
  });

  it("marks a passed finish date and closes completed projects", () => {
    expect(liveSignals({ project_status: "active", end_date: "2026-09-30" }, 0, TODAY).deadline?.label).toBe("Finish (passed)");
    const done = liveSignals({ project_status: "completed", end_date: "2026-09-30" }, 3, TODAY);
    expect([done.health.label, done.deadline]).toEqual(["Closed", null]);
  });
});

describe("countBy", () => {
  it("counts rows per project", () => {
    expect(countBy([{ project_id: "a" }, { project_id: "b" }, { project_id: "a" }])).toEqual({ a: 2, b: 1 });
  });
});
