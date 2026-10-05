import { describe, expect, it } from "vitest";
import { RULE_CATALOG, ruleFormResult, ruleFormValues, ruleSpec, type RuleSpec } from "../rule-catalog";

const spec = (code: string) => ruleSpec(code) as RuleSpec;
const def = (params: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  is_active: true,
  severity: "WARNING" as const,
  params,
  min_history_days: 10,
  ...over,
});

describe("rule catalogue", () => {
  it("lists each rule once", () => {
    const codes = RULE_CATALOG.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("intake rules have nothing a project can change", () => {
    for (const r of RULE_CATALOG.filter((x) => x.intake)) {
      expect(r.fields ?? []).toEqual([]);
      expect(r.severityEditable ?? false).toBe(false);
    }
  });
});

describe("rule form", () => {
  it("round-trips a stored definition", () => {
    const s = spec("PROGRESS_JUMP");
    const stored = def({ window_days: 10, multiplier: 3, min_samples: 3 });
    const values = ruleFormValues(s, stored);
    expect(values).toMatchObject({ is_active: true, min_history_days: "10", fields: { window_days: "10", multiplier: "3", min_samples: "3" } });
    expect(ruleFormResult(s, values, stored.params)).toEqual({
      ok: true,
      severity: "WARNING",
      is_active: true,
      min_history_days: 10,
      params: { window_days: 10, multiplier: 3, min_samples: 3 },
    });
  });

  it("keeps parameters the form does not show", () => {
    const s = spec("DELAY_NO_NOTICE_FLAG");
    const stored = def({ causes: ["EMPLOYER_CAUSED"] }, { min_history_days: 0 });
    const result = ruleFormResult(s, { ...ruleFormValues(s, stored), is_active: false }, stored.params);
    expect(result).toMatchObject({ ok: true, is_active: false, min_history_days: 0, params: { causes: ["EMPLOYER_CAUSED"] } });
  });

  it("refuses an empty, non-numeric or out-of-range threshold", () => {
    const s = spec("MANPOWER_BELOW_PLAN");
    const values = ruleFormValues(s, def({ threshold_pct: 80 }));
    for (const typed of ["", "abc", "0", "101"]) {
      expect(ruleFormResult(s, { ...values, fields: { threshold_pct: typed } })).toMatchObject({ ok: false });
    }
    expect(ruleFormResult(s, { ...values, fields: { threshold_pct: "70" } })).toMatchObject({ ok: true, params: { threshold_pct: 70 } });
  });

  it("refuses a productivity band whose lower limit is not below the upper", () => {
    const s = spec("PRODUCTIVITY_ABNORMAL");
    const values = ruleFormValues(s, def({ window_days: 10, low_ratio: 0.4, high_ratio: 2.5, min_samples: 3 }));
    expect(ruleFormResult(s, { ...values, fields: { ...values.fields, low_ratio: "1", high_ratio: "1.1" } })).toMatchObject({ ok: true });
    expect(ruleFormResult(s, { ...values, fields: { ...values.fields, low_ratio: "1", high_ratio: "1" } })).toMatchObject({ ok: false });
  });

  it("refuses approved days that are not a whole number from 0 to 365", () => {
    const s = spec("PROGRESS_JUMP");
    const values = ruleFormValues(s, def({ window_days: 10, multiplier: 3, min_samples: 3 }));
    for (const typed of ["", "-1", "2.5", "400"]) {
      expect(ruleFormResult(s, { ...values, min_history_days: typed })).toMatchObject({ ok: false });
    }
    expect(ruleFormResult(s, { ...values, min_history_days: "0" })).toMatchObject({ ok: true, min_history_days: 0 });
  });

  describe("quantity range", () => {
    const s = spec("QTY_RANGE");
    const stored = def({ by_uom: { m2: { min: 5, max: 200 } }, max_daily_progress_pct: null }, { min_history_days: 0 });

    it("reads the stored ranges and an unset limit", () => {
      expect(ruleFormValues(s, stored)).toMatchObject({ fields: { max_daily_progress_pct: "" }, ranges: [{ uom: "m2", min: "5", max: "200" }] });
    });

    it("stores ranges, an open-ended limit, the severity and no daily limit", () => {
      const result = ruleFormResult(s, {
        ...ruleFormValues(s, stored),
        severity: "ERROR",
        ranges: [
          { uom: "m2", min: "5", max: "200" },
          { uom: " m3 ", min: "", max: "40" },
          { uom: "", min: "", max: "" },
        ],
      });
      expect(result).toEqual({
        ok: true,
        severity: "ERROR",
        is_active: true,
        min_history_days: 0,
        params: { max_daily_progress_pct: null, by_uom: { m2: { min: 5, max: 200 }, m3: { min: null, max: 40 } } },
      });
    });

    it("refuses a range with no unit, no limits, a negative limit, min above max, or a unit listed twice", () => {
      const values = ruleFormValues(s, stored);
      const bad = [
        [{ uom: "", min: "1", max: "2" }],
        [{ uom: "m2", min: "", max: "" }],
        [{ uom: "m2", min: "-1", max: "5" }],
        [{ uom: "m2", min: "9", max: "5" }],
        [{ uom: "m2", min: "x", max: "5" }],
        [
          { uom: "m2", min: "1", max: "5" },
          { uom: "M2", min: "1", max: "5" },
        ],
      ];
      for (const ranges of bad) expect(ruleFormResult(s, { ...values, ranges })).toMatchObject({ ok: false });
    });

    it("accepts a daily progress limit", () => {
      const values = ruleFormValues(s, stored);
      expect(ruleFormResult(s, { ...values, fields: { max_daily_progress_pct: "40" } })).toMatchObject({ ok: true, params: { max_daily_progress_pct: 40 } });
    });
  });
});
