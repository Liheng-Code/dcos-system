import { describe, expect, it } from "vitest";
import { bucketOf, groupAttention, isoDay, rfiHref, PREVIEW_SIZE, type AttentionItem } from "@/lib/project/projects/attention";
import { checklistRecord, setupChecklist, type SetupFacts } from "@/lib/project/projects/setup-checklist";
import { calcMonths, durationAfterDateChange } from "@/lib/project/projects/project-dates";

const TODAY = "2026-10-14";
const item = (source: AttentionItem["source"], id: string, due: string): AttentionItem => ({ source, id, ref: null, title: id, due });

describe("bucketOf", () => {
  it("splits overdue, due within 7 days and later", () => {
    expect(bucketOf("2026-10-13", TODAY)).toBe("overdue");
    expect(bucketOf("2026-10-14", TODAY)).toBe("soon");
    expect(bucketOf("2026-10-21", TODAY)).toBe("soon");
    expect(bucketOf("2026-10-22", TODAY)).toBe("later");
  });

  it("reads timestamps by their date", () => {
    expect(bucketOf("2026-10-13T23:59:00+07:00", TODAY)).toBe("overdue");
  });

  it("crosses month ends", () => {
    expect(bucketOf("2026-11-04", "2026-10-28")).toBe("soon");
    expect(bucketOf("2026-11-05", "2026-10-28")).toBe("later");
  });
});

describe("isoDay", () => {
  it("formats the local date", () => {
    expect(isoDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("groupAttention", () => {
  it("counts per bucket, orders by due date and leaves out empty sources", () => {
    const groups = groupAttention([
      item("ncrs", "n2", "2026-11-30"),
      item("ncrs", "n1", "2026-10-01"),
      item("ncrs", "n3", "2026-10-15"),
      item("tasks", "t1", "2026-10-20"),
    ], TODAY);
    expect(groups.map((g) => g.source.key)).toEqual(["tasks", "ncrs"]);
    const ncrs = groups[1];
    expect([ncrs.overdue, ncrs.soon, ncrs.later, ncrs.total]).toEqual([1, 1, 1, 3]);
    expect(ncrs.preview.map((i) => i.id)).toEqual(["n1", "n3", "n2"]);
    expect(ncrs.preview[0].bucket).toBe("overdue");
  });

  it("previews at most five items but counts them all", () => {
    const many = Array.from({ length: 8 }, (_, i) => item("tasks", `t${i}`, `2026-10-0${i + 1}`));
    const [tasks] = groupAttention(many, TODAY);
    expect(tasks.total).toBe(8);
    expect(tasks.preview).toHaveLength(PREVIEW_SIZE);
  });
});

describe("rfiHref", () => {
  it("opens the discipline's register", () => {
    expect(rfiHref("str")).toBe("/dashboard/design/str/rfi");
    expect(rfiHref("mep")).toBe("/dashboard/design/mep/rfi");
    expect(rfiHref("all")).toBe("/dashboard/design/arc/rfi");
    expect(rfiHref(null)).toBe("/dashboard/design/arc/rfi");
  });
});

const complete: SetupFacts = {
  category: "residential", clientId: "c", projectManagerId: "pm", stakeholderCount: 2,
  teamMemberCount: 3, hasCalendar: true, hasNumbering: true, hasWbsSetup: true,
};

describe("setupChecklist", () => {
  it("is all green for a fully set-up project", () => {
    expect(setupChecklist(complete).every((i) => i.ok)).toBe(true);
  });

  it("flags each missing item and says where to fix it", () => {
    const items = setupChecklist({ ...complete, projectManagerId: null, teamMemberCount: 0 });
    const missing = items.filter((i) => !i.ok);
    expect(missing.map((i) => i.key)).toEqual(["pm", "team"]);
    expect(missing[0].fix).toEqual({ tab: "settings", section: "contract" });
    expect(missing[1].fix).toEqual({ tab: "team" });
  });

  it("stores the checklist by label", () => {
    const record = checklistRecord(setupChecklist({ ...complete, hasCalendar: false }));
    expect(record["Calendar configured"]).toBe(false);
    expect(record["Client assigned"]).toBe(true);
  });
});

describe("calcMonths", () => {
  it("counts whole calendar months", () => {
    expect(calcMonths("2026-01-15", "2026-07-01")).toBe("6");
    expect(calcMonths("2026-01-01", "2026-01-31")).toBe("");
    expect(calcMonths("", "2026-07-01")).toBe("");
    expect(calcMonths("2026-07-01", "2026-01-01")).toBe("");
  });
});

describe("durationAfterDateChange", () => {
  const before = { start_date: "2026-01-01", end_date: "2026-07-01", duration: "6" };

  it("follows the dates when the duration was derived from them", () => {
    expect(durationAfterDateChange(before, "2026-01-01", "2026-12-01")).toBe("11");
  });

  it("keeps a duration entered by hand", () => {
    expect(durationAfterDateChange({ ...before, duration: "8" }, "2026-01-01", "2026-12-01")).toBe("8");
  });

  it("fills an empty duration and clears it when a date is removed", () => {
    expect(durationAfterDateChange({ ...before, duration: null }, "2026-01-01", "2026-03-01")).toBe("2");
    expect(durationAfterDateChange(before, "2026-01-01", null)).toBeNull();
  });
});
