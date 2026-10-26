import { describe, expect, it } from "vitest";
import { buildCommitPayload, orderFloors, pickTender, workingDaysBetween, type ProgrammePreview } from "../boq-programme-service";

const task = (o: Record<string, unknown> = {}) => ({
  key: "mA|n1", masterId: "mA", masterCode: "A", visibleCode: null, nodeId: "n1", name: "Wall", unit: "m2", quantity: 10, budget: 100, durationDays: 2,
  basis: "labour", labourHours: 8, crewSize: 4, hoursPerDay: 8, clamped: false, confidence: "high", action: "create", existingTaskId: null,
  alsoMapped: [], unchanged: false,
  boqLines: [{ lineId: "L1", source: "contract", sharePct: 100, quantity: 10, amount: 100 }],
  resourceHours: [{ resourceId: "r1", name: "Mason", kind: "labor", hours: 8 }],
  predecessors: [{ key: "mA|n0", taskId: null, type: "fs", lagDays: 1 }], warnings: [], ...o,
});

describe("buildCommitPayload", () => {
  it("maps the preview to the RPC contract", () => {
    const preview = { projectId: "p1", source: "contract", projectStart: "2026-11-02", projectDurationDays: null, tasks: [task()], clear: ["t9"], warnings: [], totals: {} } as unknown as ProgrammePreview;
    const p = buildCommitPayload(preview);
    expect(p).toMatchObject({ project_id: "p1", source: "contract", project_start: "2026-11-02", clear_task_ids: ["t9"] });
    expect(p.tasks[0]).toMatchObject({
      key: "mA|n1", existing_task_id: null, wbs_node_id: "n1", activity_master_id: "mA", duration_days: 2, budget_cost: 100, quantity: 10,
      predecessors: [{ key: "mA|n0", task_id: null, type: "FS", lag_days: 1 }],
      boq_lines: [{ tender_boq_item_id: null, qs_boq_item_id: "L1", share_pct: 100, quantity: 10, amount: 100 }],
      resource_hours: [{ dwl_resource_id: "r1", kind: "labor", hours: 8 }],
    });
  });
  it("uses tender_boq_item_id for tender lines and an explicit start over the project's", () => {
    const preview = { projectId: "p1", source: "tender", projectStart: null, tasks: [task({ boqLines: [{ lineId: "T1", source: "tender", sharePct: 50, quantity: 5, amount: 50 }] })], clear: [] } as unknown as ProgrammePreview;
    const p = buildCommitPayload(preview, { projectStart: "2026-12-01" });
    expect(p.project_start).toBe("2026-12-01");
    expect(p.tasks[0].boq_lines[0]).toMatchObject({ tender_boq_item_id: "T1", qs_boq_item_id: null });
    expect(buildCommitPayload({ ...preview, projectStart: null } as ProgrammePreview).project_start).toBeUndefined();
  });
});

describe("skip flags and tender choice", () => {
  it("flags skipped tasks for the RPC", () => {
    const base = { projectId: "p1", source: "contract", projectStart: null, clear: [] };
    const preview = { ...base, tasks: [task({ action: "skip_started", existingTaskId: "t1" }), task({ key: "k2", action: "skip_locked" }), task({ key: "k3", action: "update", existingTaskId: "t3" })] } as unknown as ProgrammePreview;
    const p = buildCommitPayload(preview);
    expect(p.tasks.map((t) => t.skip)).toEqual(["started", "locked", undefined]);
  });
  it("takes the awarded tender, else the latest one that is not cancelled", () => {
    const t = (id: string, status: string, created_at: string) => ({ id, status, created_at });
    expect(pickTender([t("a", "draft", "2026-01-01"), t("b", "awarded", "2026-01-02"), t("c", "draft", "2026-03-01")])).toBe("b");
    expect(pickTender([t("a", "evaluation", "2026-01-01"), t("c", "draft", "2026-03-01"), t("d", "cancelled", "2026-04-01")])).toBe("c");
    expect(pickTender([t("d", "cancelled", "2026-04-01")])).toBeNull();
    expect(pickTender([])).toBeNull();
  });
});

describe("helpers", () => {
  it("orders floors by building then level rank", () => {
    const l = (id: string, code: string, b = "BA") => ({ id, wbs_code: code, wbs_name: code, building_code: b });
    expect(orderFloors([l("r", "R00"), l("l2", "L02"), l("g", "G00"), l("b", "B01"), l("l1", "L01")])).toEqual(["b", "g", "l1", "l2", "r"]);
  });
  it("counts Mon-Sat working days", () => {
    expect(workingDaysBetween("2026-11-02", "2026-11-08")).toBe(6);
    expect(workingDaysBetween("2026-11-08", "2026-11-02")).toBeNull();
  });
});
