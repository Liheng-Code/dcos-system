// Undo / redo for the schedule (doc 35 U2; PRD FR-060). Pure, no I/O. Each entry is one user action: the fields
// it changed on each task, before and after. Undo writes the "before" values back, redo the "after" values.
// Ripple changes (dates the CPM engine moved as a side effect) are kept apart: they are recalculated when the
// engine runs, and written back from the entry only when it does not.

export interface FieldChange<T> {
  id: string;
  before: Partial<T>;
  after: Partial<T>;
}

export interface HistoryEntry<T> {
  label: string;
  /** fields the user changed */
  changes: FieldChange<T>[];
  /** dates the engine moved because of them */
  ripple: FieldChange<T>[];
}

export interface HistoryState<T> {
  past: HistoryEntry<T>[];
  future: HistoryEntry<T>[];
}

export const HISTORY_LIMIT = 50;

export const emptyHistory = <T>(): HistoryState<T> => ({ past: [], future: [] });

/** The previous values of the fields a patch sets. */
export function captureChange<T extends { id: string }>(task: T, patch: Partial<T>): FieldChange<T> {
  const before: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) before[k] = task[k];
  return { id: task.id, before, after: { ...patch } };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** True when the change does nothing (every field equal before and after). */
export function isNoop<T>(c: FieldChange<T>): boolean {
  return (Object.keys(c.after) as (keyof T)[]).every((k) => same(c.before[k], c.after[k]));
}

/** Adds an action; clears the redo list. Entries that change nothing are dropped. */
export function pushEntry<T>(state: HistoryState<T>, entry: HistoryEntry<T>, limit = HISTORY_LIMIT): HistoryState<T> {
  const changes = entry.changes.filter((c) => !isNoop(c));
  const ripple = entry.ripple.filter((c) => !isNoop(c));
  if (changes.length === 0 && ripple.length === 0) return state;
  return { past: [...state.past, { ...entry, changes, ripple }].slice(-limit), future: [] };
}

/** The entry to undo and the state after it, or null when there is nothing to undo. */
export function takeUndo<T>(state: HistoryState<T>): { entry: HistoryEntry<T>; state: HistoryState<T> } | null {
  const entry = state.past[state.past.length - 1];
  if (!entry) return null;
  return { entry, state: { past: state.past.slice(0, -1), future: [entry, ...state.future] } };
}

export function takeRedo<T>(state: HistoryState<T>): { entry: HistoryEntry<T>; state: HistoryState<T> } | null {
  const entry = state.future[0];
  if (!entry) return null;
  return { entry, state: { past: [...state.past, entry], future: state.future.slice(1) } };
}

/** The patches that undo (before) or redo (after) an entry's changes or its ripple. */
export function patchesFor<T>(changes: readonly FieldChange<T>[], direction: "undo" | "redo"): { id: string; patch: Partial<T> }[] {
  return changes.map((c) => ({ id: c.id, patch: { ...(direction === "undo" ? c.before : c.after) } }));
}

/** Puts an entry back after a failed undo / redo, so the user can try again. */
export function restoreAfterFailure<T>(state: HistoryState<T>, entry: HistoryEntry<T>, direction: "undo" | "redo"): HistoryState<T> {
  return direction === "undo"
    ? { past: [...state.past, entry], future: state.future.filter((e) => e !== entry) }
    : { past: state.past.filter((e) => e !== entry), future: [entry, ...state.future] };
}
