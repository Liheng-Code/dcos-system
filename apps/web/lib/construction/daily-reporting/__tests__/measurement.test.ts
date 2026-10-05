import { describe, expect, it } from "vitest";
import { contractItemsFor, measurementCsv, type ContractItemRef, type MeasurementRow, type SubcontractMeasurement } from "../measurement";

const item = (code: string, node: string | null, unit: string): ContractItemRef => ({
  id: code,
  item_code: code,
  description: null,
  unit,
  quantity: 100,
  wbs_node_id: node,
});

const row = (over: Partial<MeasurementRow> = {}): MeasurementRow => ({
  unit_id: "u1",
  unit_code: "SC-01",
  task_id: "t1",
  task_code: "A-1",
  activity: "Blockwork",
  wbs_node_id: "n1",
  wbs_code: "L06",
  wbs_name: "Level 6",
  uom: "m2",
  days: 2,
  first_date: "2026-10-01",
  last_date: "2026-10-02",
  reported_qty: 80,
  verified_qty: 70,
  adjusted_lines: 1,
  progress_from: 0,
  progress_to: 30,
  ...over,
});

describe("pointing a measured activity at contract items", () => {
  const items = [item("B-02", "n1", "m3"), item("B-01", "n1", "M2"), item("C-01", "n2", "m2"), item("D-01", null, "m2")];

  it("offers the items on the same WBS node, same unit of measure first", () => {
    expect(contractItemsFor(row(), items).map((i) => i.item_code)).toEqual(["B-01", "B-02"]);
  });

  it("offers nothing for an activity with no WBS node, or a node with no items", () => {
    expect(contractItemsFor(row({ wbs_node_id: null }), items)).toEqual([]);
    expect(contractItemsFor(row({ wbs_node_id: "n9" }), items)).toEqual([]);
  });
});

describe("export", () => {
  it("writes one line per row under a header, with empty cells for missing figures", () => {
    const m: SubcontractMeasurement = {
      units: [],
      coverage: { approved: 2, pending: 0, no_work: 0 },
      rows: [row(), row({ task_code: null, activity: "Clean up, level 6", wbs_node_id: null, wbs_code: null, wbs_name: null, reported_qty: null, verified_qty: null, uom: null })],
    };
    const csv = measurementCsv(m, [item("B-01", "n1", "m2")]);
    expect(csv).toHaveLength(3);
    expect(csv[0][0]).toBe("Unit");
    expect(csv[1]).toEqual(["SC-01", "L06 Level 6", "A-1", "Blockwork", "m2", "2", "2026-10-01", "2026-10-02", "80", "70", "1", "0", "30", "B-01"]);
    expect(csv[2].slice(1, 5)).toEqual(["", "", "Clean up, level 6", ""]);
    expect(csv[2][8]).toBe("");
    expect(csv[2][13]).toBe("");
  });
});
