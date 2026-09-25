import { describe, expect, it } from "vitest";
import { normalizeLevel, suggestBoqMatches, type BoqCandidate, type TaskForMatch } from "../boq-matching";

function task(over: Partial<TaskForMatch>): TaskForMatch {
  return { id: "t1", taskCode: "T1", taskName: "", discipline: null, levelLabel: null, costCode: null, hasQuantity: false, ...over };
}
function candidate(over: Partial<BoqCandidate>): BoqCandidate {
  return { id: "c1", source: "tender_boq", code: "C1", description: "", unit: "m3", quantity: 1, level: null, budgetCode: null, ...over };
}

describe("normalizeLevel", () => {
  it("strips a leading sort prefix and recognises common floor spellings", () => {
    expect(normalizeLevel("04.1F")).toBe("1F");
    expect(normalizeLevel("Ground Floor")).toBe("GF");
    expect(normalizeLevel("02.GF")).toBe("GF");
    expect(normalizeLevel("Mezzanine")).toBe("MZ");
    expect(normalizeLevel("Level 3")).toBe("3F");
    expect(normalizeLevel("All")).toBe("ALL");
    expect(normalizeLevel(null)).toBeNull();
    expect(normalizeLevel("Random Zone")).toBeNull();
  });
});

describe("suggestBoqMatches — the real 03.01.02.01.01 'Setting Out' case", () => {
  it("matches a task to the BOQ line that names it, ranked above unrelated lines", () => {
    const tasks = [task({ id: "t1", taskName: "Setting Out", levelLabel: "03.1F" })];
    const candidates = [
      candidate({ id: "boq-setting-out", code: "Z.01.01.04", description: "Setting out & ongoing survey works", unit: "Month", quantity: 18, level: "All" }),
      candidate({ id: "boq-crane", code: "Z.01.05.01", description: "Tower crane rental", unit: "Month", quantity: 16, level: "All" }),
    ];
    const result = suggestBoqMatches(tasks, candidates);
    const top = result.get("t1");
    expect(top).toBeDefined();
    expect(top![0].candidate.id).toBe("boq-setting-out");
    expect(top![0].reasons.some((r) => r.includes("name overlap"))).toBe(true);
  });

  it("scores an exact-level match higher than an unrelated level, all else equal", () => {
    const tasks = [task({ id: "t1", taskName: "Blockwork 100mm", levelLabel: "2F" })];
    const candidates = [
      candidate({ id: "same-level", description: "Blockwork 100mm internal wall", level: "2F" }),
      candidate({ id: "other-level", description: "Blockwork 100mm internal wall", level: "5F" }),
    ];
    const result = suggestBoqMatches(tasks, candidates);
    const top = result.get("t1")!;
    expect(top[0].candidate.id).toBe("same-level");
    expect(top[0].score).toBeGreaterThan(top[1].score);
  });

  it("gives a lump 'All' BOQ line a weaker, non-zero level signal", () => {
    const tasks = [task({ id: "t1", taskName: "Site Clearance", levelLabel: "GF" })];
    const candidates = [candidate({ id: "lump", description: "Demobilization & site clearance", level: "All" })];
    const result = suggestBoqMatches(tasks, candidates);
    expect(result.get("t1")![0].reasons).toContain("applies to all levels");
  });

  it("matching budget codes contribute even with no name overlap, but not enough alone to clear the default threshold", () => {
    const tasks = [task({ id: "t1", taskName: "Excavate pit", costCode: "03.10" })];
    const candidates = [candidate({ id: "c1", description: "Something entirely unrelated", budgetCode: "03.10" })];
    expect(suggestBoqMatches(tasks, candidates).has("t1")).toBe(false);
    const lenient = suggestBoqMatches(tasks, candidates, { minScore: 0 });
    expect(lenient.get("t1")![0].reasons).toContain("same budget code");
  });

  it("filters out candidates below minScore and returns nothing for a task with no plausible match", () => {
    const tasks = [task({ id: "t1", taskName: "Excavate pit" })];
    const candidates = [candidate({ id: "c1", description: "Paint external facade" })];
    const result = suggestBoqMatches(tasks, candidates);
    expect(result.has("t1")).toBe(false);
  });

  it("caps suggestions at topN, best first", () => {
    const tasks = [task({ id: "t1", taskName: "Column Concrete C30" })];
    const candidates = Array.from({ length: 5 }, (_, i) => candidate({ id: `c${i}`, description: "Column Concrete C30 pour" }));
    const result = suggestBoqMatches(tasks, candidates, { topN: 2 });
    expect(result.get("t1")).toHaveLength(2);
  });
});
