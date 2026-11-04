import { describe, expect, it } from "vitest";
import {
  captureChange, emptyHistory, patchesFor, pushEntry, restoreAfterFailure, takeRedo, takeUndo, type HistoryEntry,
} from "../edit-history";

interface T { id: string; name: string; duration: number; start: string | null }
const task: T = { id: "a", name: "Pour slab", duration: 5, start: "2026-11-02" };
const entry = (label: string, patch: Partial<T>): HistoryEntry<T> => ({ label, changes: [captureChange(task, patch)], ripple: [] });

describe("edit history", () => {
  it("captures only the fields the patch sets", () => {
    expect(captureChange(task, { duration: 8 })).toEqual({ id: "a", before: { duration: 5 }, after: { duration: 8 } });
  });

  it("undo then redo walks the stack; a new action clears redo", () => {
    let s = pushEntry(emptyHistory<T>(), entry("Duration", { duration: 8 }));
    s = pushEntry(s, entry("Name", { name: "Pour level 2 slab" }));
    const u = takeUndo(s)!;
    expect(u.entry.label).toBe("Name");
    expect(patchesFor(u.entry.changes, "undo")).toEqual([{ id: "a", patch: { name: "Pour slab" } }]);
    s = u.state;
    expect(s.past.map((e) => e.label)).toEqual(["Duration"]);
    expect(s.future.map((e) => e.label)).toEqual(["Name"]);
    const r = takeRedo(s)!;
    expect(patchesFor(r.entry.changes, "redo")).toEqual([{ id: "a", patch: { name: "Pour level 2 slab" } }]);
    s = takeUndo(r.state)!.state;
    s = pushEntry(s, entry("Start", { start: "2026-11-09" }));
    expect(s.future).toEqual([]);
    expect(s.past.map((e) => e.label)).toEqual(["Duration", "Start"]);
  });

  it("drops actions that change nothing and keeps at most the limit", () => {
    let s = pushEntry(emptyHistory<T>(), entry("Same", { duration: 5 }));
    expect(s.past).toEqual([]);
    for (let i = 0; i < 60; i++) s = pushEntry(s, entry(`d${i}`, { duration: 10 + i }), 50);
    expect(s.past).toHaveLength(50);
    expect(s.past[0].label).toBe("d10");
  });

  it("nothing to undo or redo returns null", () => {
    expect(takeUndo(emptyHistory<T>())).toBeNull();
    expect(takeRedo(emptyHistory<T>())).toBeNull();
  });

  it("a failed undo puts the entry back", () => {
    const s = pushEntry(emptyHistory<T>(), entry("Duration", { duration: 8 }));
    const u = takeUndo(s)!;
    const back = restoreAfterFailure(u.state, u.entry, "undo");
    expect(back.past.map((e) => e.label)).toEqual(["Duration"]);
    expect(back.future).toEqual([]);
  });
});
