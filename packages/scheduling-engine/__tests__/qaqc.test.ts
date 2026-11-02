// Schedule QA/QC (doc 35 Q1): one clean programme that passes all 14 DCMA checks, then one broken
// programme per check. Mon–Fri calendar, project start Monday 2027-01-04.

import { describe, expect, it } from "vitest";
import { scheduleProject, type ScheduleOptions } from "../src/schedule-engine";
import { runScheduleQaqc, type QaqcCheckCode, type QaqcTask } from "../src/schedule-qaqc";
import { MON_FRI, fs, ss, task } from "./fixtures";

const START = "2027-01-04";
const TH = { critical: 0, nearCritical: 5 };

const q = (id: string, dur: number, deps = [] as ReturnType<typeof fs>[], extra: Partial<QaqcTask> = {}): QaqcTask => ({
  ...task(id, dur, deps), code: id, resourceCount: dur > 0 ? 1 : 0, ...extra,
});

/** Start ▸ A ▸ B ▸ C ▸ Finish, all finish-to-start, all resourced. */
function clean(): QaqcTask[] {
  return [q("S", 0), q("A", 5, [fs("S")]), q("B", 5, [fs("A")]), q("C", 5, [fs("B")]), q("F", 0, [fs("C")])];
}

function check(tasks: QaqcTask[], opts: ScheduleOptions = {}, dataDate = START) {
  const r = scheduleProject(tasks, MON_FRI, START, TH, opts);
  if (!r.ok) throw new Error("cycle");
  const results = runScheduleQaqc(tasks, r, MON_FRI, START, dataDate, TH, opts);
  const get = (code: QaqcCheckCode) => results.find((x) => x.code === code)!;
  return { results, get };
}

describe("DCMA 14-point checks", () => {
  it("a clean programme passes all 14", () => {
    const { results } = check(clean());
    expect(results).toHaveLength(14);
    expect(results.filter((r) => !r.pass).map((r) => `${r.code}: ${r.message}`)).toEqual([]);
    expect(results.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("1 logic: an activity with no links fails", () => {
    const { get } = check([...clean(), q("X", 2)]);
    expect(get("logic").pass).toBe(false);
    expect(get("logic").affected).toEqual(["X"]);
  });

  it("2 leads: a negative lag fails", () => {
    const t = clean();
    t[2] = q("B", 5, [fs("A", -2)]);
    expect(check(t).get("leads").affected).toEqual(["B"]);
  });

  it("3 lags: lags on more than 5% of links fail", () => {
    const t = clean();
    t[2] = q("B", 5, [fs("A", 3)]);
    const r = check(t).get("lags");
    expect(r.metric).toBe(25);
    expect(r.pass).toBe(false);
  });

  it("4 relationship types: under 90% finish-to-start fails", () => {
    const t = clean();
    t[2] = q("B", 5, [ss("A")]);
    t[3] = q("C", 5, [ss("B")]);
    const r = check(t).get("relationship_types");
    expect(r.metric).toBe(50);
    expect(r.pass).toBe(false);
  });

  it("5 hard constraints: a must-start-on fails", () => {
    const t = clean();
    t[1] = q("A", 5, [fs("S")], { constraintType: "must_start_on", constraintDate: "2027-01-04" });
    expect(check(t).get("hard_constraints").affected).toEqual(["A"]);
  });

  it("6 high float: an activity with more than 44 days of float fails", () => {
    const t = [q("S", 0), q("A", 60, [fs("S")]), q("Y", 1, [fs("S")]), q("F", 0, [fs("A"), fs("Y")])];
    const r = check(t).get("high_float");
    expect(r.affected).toEqual(["Y"]);
    expect(r.pass).toBe(false);
  });

  it("7 negative float: a programme past its must-finish-by date fails", () => {
    const r = check(clean(), { mustFinishBy: "2027-01-20" }).get("negative_float");
    expect(r.pass).toBe(false);
    expect(r.affected).toEqual(expect.arrayContaining(["A", "B", "C"]));
  });

  it("8 high duration: more than 44 working days left fails", () => {
    const t = clean();
    t[2] = q("B", 50, [fs("A")]);
    expect(check(t).get("high_duration").affected).toEqual(["B"]);
  });

  it("9 invalid dates: an actual date after the data date fails", () => {
    const t = clean();
    t[1] = q("A", 5, [fs("S")], { actualStart: "2027-01-20" });
    expect(check(t, { dataDate: START }).get("invalid_dates").affected).toEqual(["A"]);
  });

  it("10 resources: activities without resources or cost fail", () => {
    const t = clean().map((x) => ({ ...x, resourceCount: 0 }));
    t[1].budgetCost = 1000; // cost counts as loaded
    const r = check(t).get("resources");
    expect(r.affected).toEqual(["B", "C"]);
    expect(r.pass).toBe(false);
  });

  it("11 missed tasks and 14 BEI: work due by the data date but not finished fails", () => {
    const t = clean();
    t[1] = q("A", 5, [fs("S")], { baselineFinish: "2027-01-08" });
    const { get } = check(t, { dataDate: "2027-01-11" }, "2027-01-11");
    expect(get("missed_tasks").affected).toEqual(["A"]);
    expect(get("bei").metric).toBe(0);
    expect(get("bei").pass).toBe(false);
  });

  it("12 critical path test: a must-finish-on completion milestone breaks the path", () => {
    const t = clean();
    t[4] = q("F", 0, [fs("C")], { constraintType: "must_finish_on", constraintDate: "2027-01-25" });
    const r = check(t).get("critical_path_test");
    expect(r.pass).toBe(false);
  });

  it("13 CPLI: a critical path that needs more time than remains fails", () => {
    const r = check(clean(), { mustFinishBy: "2027-01-20" }).get("cpli");
    expect(r.metric).toBeLessThan(0.95);
    expect(r.pass).toBe(false);
  });
});
