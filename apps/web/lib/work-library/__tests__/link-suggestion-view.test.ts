import { describe, expect, it } from "vitest";
import { autoPicks, picksToList, scoreLabel, togglePick } from "../link-suggestion-view";
import type { LinkSuggestionRow } from "../link-suggestion-service";

const sug = (masterId: string, score: number) => ({ masterId, score, reasons: [], visibleCode: null, code: masterId, name: masterId, status: "draft" });
const row = (id: string, band: "auto" | "review", s: ReturnType<typeof sug>[]): LinkSuggestionRow => ({
  workItem: { id, code: id, description: id, unit: "m2" }, suggestions: s, band,
});

describe("link suggestion view helpers", () => {
  it("auto-picks the top suggestion of auto rows only", () => {
    const m = autoPicks([row("w1", "auto", [sug("a", 0.9), sug("b", 0.6)]), row("w2", "review", [sug("c", 0.7)])]);
    expect([...m.keys()]).toEqual(["w1"]);
    expect(m.get("w1")).toEqual({ masterId: "a", score: 0.9 });
  });

  it("toggles one pick per item", () => {
    let p = togglePick(new Map(), "w1", { masterId: "a", score: 0.9 });
    p = togglePick(p, "w1", { masterId: "b", score: 0.6 });
    expect(p.get("w1")?.masterId).toBe("b");
    p = togglePick(p, "w1", { masterId: "b", score: 0.6 });
    expect(p.size).toBe(0);
  });

  it("converts picks to the apply list and formats scores", () => {
    expect(picksToList(new Map([["w1", { masterId: "a", score: 0.9 }]]))).toEqual([{ workItemId: "w1", masterId: "a", score: 0.9 }]);
    expect(scoreLabel(0.856)).toBe("86%");
  });
});
