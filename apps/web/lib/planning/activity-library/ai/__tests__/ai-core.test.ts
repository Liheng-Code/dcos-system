import { describe, expect, it } from "vitest";
import {
  buildConflictContext, buildMatchContext, checkGate, conflictSuggestions, costUsd, detectRunConflicts, explainSuggestion,
  matchSuggestions, numbersSubset, productivitySuggestion, quantitySuggestion, shortlistMasters,
  type AiSettings, type BoqOption, type MasterOption, type RunItemFacts,
} from "../ai-core";

const settings: AiSettings = { enabled: true, monthly_cap_usd: 50, run_token_limit: 20000, model: null, price_in_per_mtok: 2, price_out_per_mtok: 10 };

describe("gate and cost", () => {
  const ok = { keyConfigured: true, monthSpend: 1, promptTokens: 500 };
  it("is closed by default and says why", () => {
    expect(checkGate({ ...settings, enabled: false }, ok)).toMatchObject({ ok: false });
    expect(checkGate(settings, { ...ok, keyConfigured: false })).toMatchObject({ ok: false });
  });
  it("stops at the monthly cap and on oversized prompts", () => {
    expect((checkGate(settings, { ...ok, monthSpend: 50 }) as { reason: string }).reason).toContain("USD 50");
    expect(checkGate(settings, { ...ok, promptTokens: 20001 })).toMatchObject({ ok: false });
    expect(checkGate(settings, ok)).toEqual({ ok: true });
  });
  it("prices tokens from the settings", () => {
    // 10k in at $2/M + 2k out at $10/M
    expect(costUsd(10_000, 2_000, settings)).toBe(0.04);
  });
});

describe("numbersSubset", () => {
  const data = "6 usable logs, median 0.733, change +36.4%, 1,200 m3";
  it("accepts figures that are in the data and small ordinary numbers", () => {
    expect(numbersSubset("Median is 0.733 over 6 logs; step 2", data)).toBe(true);
    expect(numbersSubset("about 1200 m3", data)).toBe(true);
  });
  it("rejects a figure that is not in the data", () => {
    expect(numbersSubset("it should be 45 per day", data)).toBe(false);
    expect(numbersSubset("median 0.8", data)).toBe(false);
  });
});

describe("find_activity_master", () => {
  const masters: MasterOption[] = [
    { id: "a", code: "STR-RC-SLAB-007", name: "Concrete Casting", family: "Slab", work_type: "Concrete Works", unit: "m3" },
    { id: "b", code: "STR-RC-COL-003", name: "Column Concrete Casting", family: "Column", work_type: "Concrete Works", unit: "m3" },
    { id: "c", code: "ARC-FIN-FLR-004", name: "Tile Flooring Installation", family: "Floor Finishes", work_type: "Finishes", unit: "m2" },
  ];
  it("shortlists by keyword, tolerant of plurals, best first", () => {
    const s = shortlistMasters("cast slabs concrete", masters);
    expect(s[0].id).toBe("a");
    expect(s.map((x) => x.id)).not.toContain("c");
  });
  it("returns nothing for text with no usable words", () => {
    expect(shortlistMasters("the of", masters)).toEqual([]);
  });
  it("drops an id the model invented and de-duplicates", () => {
    const sl = shortlistMasters("concrete casting", masters);
    const out = { matches: [{ master_id: "zzz", confidence: 0.9, reason: "made up" }, { master_id: "a", confidence: 2, reason: "x" }, { master_id: "a", confidence: 0.5, reason: "dup" }] };
    const d = matchSuggestions(out, sl, "concrete casting");
    expect(d).toHaveLength(1);
    expect(d[0].payload).toMatchObject({ master_id: "a" });
    expect(d[0].confidence).toBe(1); // clamped
    expect(buildMatchContext("q", sl)).toContain("<data>");
  });
});

describe("suggest_quantity_mapping", () => {
  const options: BoqOption[] = [{ id: "o1", source: "qs_boq", code: "STR-001", description: "Concrete C25/30 to slabs, L1-L3", unit: "m3", quantity: 540, score: 0.48 }];
  const facts = { itemId: "i1", activity: "Concrete Casting", family: "Slab", level: "1F Floor", metric: "slab_volume", metricUnit: "m3", runLevels: 3 };
  const hint = (d: string) => (/L1-L3/.test(d) ? 3 : null);
  it("shares a multi-level line over the levels named, as arithmetic not opinion", () => {
    const d = quantitySuggestion({ candidate_id: "o1", confidence: 0.8, reason: "same element" }, options, facts, hint)[0];
    expect(d.payload).toMatchObject({ boq_item_id: "o1", levels: 3 });
    expect(d.recommendation).toContain("shared equally over 3 levels");
    expect(d.affected.map((a) => a.type)).toEqual(["generation_item", "qs_boq"]);
  });
  it("returns nothing for null or an unknown candidate", () => {
    expect(quantitySuggestion({ candidate_id: null, confidence: 0.1, reason: "" }, options, facts, hint)).toEqual([]);
    expect(quantitySuggestion({ candidate_id: "nope", confidence: 0.9, reason: "" }, options, facts, hint)).toEqual([]);
  });
});

describe("detect_schedule_conflict", () => {
  const item = (over: Partial<RunItemFacts>): RunItemFacts => ({
    id: Math.random().toString(), master_code: "M", master_name: "m", node_name: "1F", confidence: "high", reasons: [], duration_days: 1, quantity: null, ...over,
  });
  it("finds nothing in a clean run", () => {
    expect(detectRunConflicts([item({}), item({})])).toEqual([]);
  });
  it("groups reasons, weak levels and missing durations", () => {
    const items = [
      item({ master_code: "A", node_name: "1F", confidence: "low", reasons: ["missing_quantity", "no_productivity"], duration_days: null }),
      item({ master_code: "B", node_name: "1F", confidence: "low", reasons: ["missing_quantity"], duration_days: null }),
      item({ master_code: "C", node_name: "2F", confidence: "review", reasons: ["draft_productivity"] }),
    ];
    const f = detectRunConflicts(items);
    expect(f.find((x) => x.type === "missing_quantity")!.count).toBe(2);
    expect(f.find((x) => x.type === "weak_level")!.items).toEqual(["1F"]);
    expect(f.find((x) => x.type === "no_duration")!.count).toBe(2);
  });
  it("keeps only suggestions that cite real findings and real numbers", () => {
    const f = detectRunConflicts([item({ confidence: "low", reasons: ["missing_quantity"], duration_days: null }), item({ confidence: "low", reasons: ["missing_quantity"], duration_days: null })]);
    const data = buildConflictContext(2, f);
    const d = conflictSuggestions({
      suggestions: [
        { finding_ids: ["F1"], recommendation: "Add quantities for the 2 activities", reason: "No duration without them", confidence: 0.9 },
        { finding_ids: ["F99"], recommendation: "ghost", reason: "x", confidence: 0.9 },
        { finding_ids: ["F1"], recommendation: "Fix all 47 activities", reason: "x", confidence: 0.9 },
      ],
    }, f, data, "run1");
    expect(d).toHaveLength(1);
    expect(d[0].payload).toEqual({ finding_ids: ["F1"] });
  });
});

describe("explanations stay inside the data", () => {
  it("explain_generation rejects an invented figure", () => {
    const data = "total: 117\nhigh: 72";
    expect(explainSuggestion({ explanation: "72 of 117 are high confidence", key_points: [], confidence: 0.9 }, data, "r", "2026-00001")).toHaveLength(1);
    expect(explainSuggestion({ explanation: "88 are high confidence", key_points: [], confidence: 0.9 }, data, "r", "2026-00001")).toEqual([]);
  });
  it("suggest_productivity rejects a figure not in the statistics", () => {
    const data = "median PI: 0.733";
    expect(productivitySuggestion({ summary: "Median PI is 0.733", concerns: [], confidence: 0.7 }, data, "s", "std")).toHaveLength(1);
    expect(productivitySuggestion({ summary: "Median PI is 0.9", concerns: [], confidence: 0.7 }, data, "s", "std")).toEqual([]);
  });
});

import { buildRecoveryContext, recoverySuggestion } from "../ai-core";

describe("suggest_recovery_plan", () => {
  const facts = { liveFinish: "2027-12-07", targetFinish: "2027-11-19", gapWd: 15, criticalCount: 7 };
  const scen = [{ key: "A", name: "More resources", levers: 1, kinds: "crew", finish: "2027-11-19", recoveredWd: 15, remainingGapWd: 0, meetsTarget: true, risk: "low", resourceNote: "1 activity needs more crews" }];
  const data = buildRecoveryContext(facts, scen);
  const options = [{ key: "A", name: "More resources", payload: { scenario: { key: "A" }, target_finish: "2027-11-19" } }];

  it("keeps a recommendation that names a real scenario and uses only figures from the data", () => {
    const d = recoverySuggestion({ recommended_key: "A", rationale: "Recovers 15 working days at low risk", trade_offs: ["Needs more crews on 1 activity"], confidence: 0.8 }, options, data, "p1");
    expect(d).toHaveLength(1);
    expect(d[0].kind).toBe("recovery");
    expect(d[0].target_id).toBe("p1");
    expect(d[0].payload).toEqual({ scenario: { key: "A" }, target_finish: "2027-11-19" }); // from the engine, not the model
    expect(d[0].required_approval).toContain("Planning Manager");
  });
  it("drops an unknown scenario, an invented figure, or no recommendation", () => {
    expect(recoverySuggestion({ recommended_key: "Z", rationale: "x", trade_offs: [], confidence: 1 }, options, data, "p1")).toEqual([]);
    expect(recoverySuggestion({ recommended_key: "A", rationale: "Saves 44 working days", trade_offs: [], confidence: 1 }, options, data, "p1")).toEqual([]);
    expect(recoverySuggestion({ recommended_key: null, rationale: "none fits", trade_offs: [], confidence: 0.2 }, options, data, "p1")).toEqual([]);
  });
});

describe("recovery context with logged delays", () => {
  const facts = { liveFinish: "2027-12-07", targetFinish: "2027-11-19", gapWd: 15, criticalCount: 7 };
  const scen = (touches: number) => [{ key: "C", name: "Expedite", levers: 1, kinds: "expedite", finish: "2027-11-19", recoveredWd: 15, remainingGapWd: 0, meetsTarget: true, risk: "medium", resourceNote: "1 activity to expedite", touchesDelayed: touches }];

  it("states the logged delays and which changes touch delayed activities", () => {
    const ctx = buildRecoveryContext(facts, scen(1), { open: 2, totalImpactDays: 21.5, causes: ["Late steel delivery", "Design change"] });
    expect(ctx).toContain("LOGGED DELAYS (delay register, open or disputed): 2 entries, 21.5 wd total impact");
    expect(ctx).toContain("Late steel delivery; Design change");
    expect(ctx).toContain("1 change(s) on activities with a logged delay");
  });
  it("says so when the register is empty, and does not invent a delay line", () => {
    const ctx = buildRecoveryContext(facts, scen(0), { open: 0, totalImpactDays: 0, causes: [] });
    expect(ctx).toContain("LOGGED DELAYS: none in the register");
    expect(ctx).not.toContain("with a logged delay");
  });
  it("a recommendation may quote the logged impact because it is in the data", () => {
    const ctx = buildRecoveryContext(facts, scen(1), { open: 2, totalImpactDays: 21.5, causes: ["Late steel delivery"] });
    const ok = recoverySuggestion({ recommended_key: "C", rationale: "Two logged delays total 21.5 wd", trade_offs: [], confidence: 0.7 }, [{ key: "C", name: "Expedite", payload: {} }], ctx, "p");
    expect(ok).toHaveLength(1);
    const bad = recoverySuggestion({ recommended_key: "C", rationale: "Logged delays total 30 wd", trade_offs: [], confidence: 0.7 }, [{ key: "C", name: "Expedite", payload: {} }], ctx, "p");
    expect(bad).toEqual([]);
  });
});
