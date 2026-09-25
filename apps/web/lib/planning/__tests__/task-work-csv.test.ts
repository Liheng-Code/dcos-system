import { describe, expect, it } from "vitest";
import { parseCsv, parseTaskWorkImportCsv } from "../task-work-csv";

describe("parseCsv", () => {
  it("splits plain comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    expect(parseCsv('a,"b, with a comma","c ""quoted"""\n')).toEqual([["a", "b, with a comma", 'c "quoted"']]);
  });

  it("handles a quoted field with an embedded newline", () => {
    expect(parseCsv('a,"line1\nline2"\n')).toEqual([["a", "line1\nline2"]]);
  });

  it("normalises CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseTaskWorkImportCsv", () => {
  const taskIndex = new Map([["03.01.02.01.01", "task-1"], ["03.02.01.01", "task-2"]]);

  it("parses valid rows and resolves task ids by code", () => {
    const csv = "task_code,quantity,unit\n03.01.02.01.01,100,m2\n03.02.01.01,50,m3\n";
    const { rows, errors } = parseTaskWorkImportCsv(csv, taskIndex);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { line: 2, taskCode: "03.01.02.01.01", taskId: "task-1", quantity: 100, unit: "m2", reason: null },
      { line: 3, taskCode: "03.02.01.01", taskId: "task-2", quantity: 50, unit: "m3", reason: null },
    ]);
  });

  it("accepts header aliases and a per-row reason column in any order", () => {
    const csv = "reason,qty,code,unit\nRemeasured,10,03.01.02.01.01,m2\n";
    const { rows, errors } = parseTaskWorkImportCsv(csv, taskIndex);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({ taskCode: "03.01.02.01.01", quantity: 10, unit: "m2", reason: "Remeasured" });
  });

  it("rejects a file missing a required column", () => {
    const { errors } = parseTaskWorkImportCsv("task_code,quantity\n03.01.02.01.01,10\n", taskIndex);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/unit/);
  });

  it("flags an unknown task code without throwing", () => {
    const { rows, errors } = parseTaskWorkImportCsv("task_code,quantity,unit\nNOPE,10,m2\n", taskIndex);
    expect(rows).toHaveLength(0);
    expect(errors).toEqual([{ line: 2, taskCode: "NOPE", message: "No task with this code in the project." }]);
  });

  it("flags a non-numeric or negative quantity", () => {
    const csv = "task_code,quantity,unit\n03.01.02.01.01,abc,m2\n03.02.01.01,-5,m2\n";
    const { rows, errors } = parseTaskWorkImportCsv(csv, taskIndex);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });

  it("flags a missing unit or missing task code", () => {
    const csv = "task_code,quantity,unit\n03.01.02.01.01,10,\n,10,m2\n";
    const { rows, errors } = parseTaskWorkImportCsv(csv, taskIndex);
    expect(rows).toHaveLength(0);
    expect(errors.map((e) => e.message)).toEqual(["Missing unit.", "Missing task_code."]);
  });

  it("keeps only the first row of a duplicate task code", () => {
    const csv = "task_code,quantity,unit\n03.01.02.01.01,10,m2\n03.01.02.01.01,20,m2\n";
    const { rows, errors } = parseTaskWorkImportCsv(csv, taskIndex);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(10);
    expect(errors[0].message).toMatch(/Duplicate/);
  });

  it("reports an empty file", () => {
    expect(parseTaskWorkImportCsv("", taskIndex).errors[0].message).toMatch(/empty/i);
  });
});
