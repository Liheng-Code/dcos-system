// Small pure rules shared by the Activity Database services and UI.

import type { LibraryStatus } from "./types";

/**
 * Archive (retire) is allowed from draft, active and superseded only, matching trg_plan_act_master_guard
 * (approved and under_review masters must go back to draft or be activated first).
 */
export function canArchive(status: LibraryStatus | string): boolean {
  return status === "draft" || status === "active" || status === "superseded";
}

/**
 * Prepares user text for a PostgREST `or(...)` ilike filter: characters that break the filter syntax (comma,
 * parentheses, double quote, asterisk, backslash) become spaces, and the LIKE wildcards % and _ are escaped.
 */
export function safeTerm(q: string): string {
  return q.replace(/[,()"*\\]/g, " ").replace(/[%_]/g, (c) => `\\${c}`).replace(/\s+/g, " ").trim();
}

/**
 * Lists show one row per activity: among the versions of a code the latest (highest version) wins.
 * Callers pass only current rows (not superseded / archived), so this is the latest non-superseded version
 * whatever its status (a newer draft hides the active version it will replace). Order of the input is kept.
 */
export function pickLatestPerCode<T extends { code: string; version: number }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.code);
    if (!cur || r.version > cur.version) best.set(r.code, r);
  }
  return rows.filter((r) => best.get(r.code) === r);
}

/** Keeps the last row for each key (later rows win) and reports the keys that occurred more than once. */
export function dedupeLast<T>(rows: T[], key: (r: T) => string): { rows: T[]; duplicates: T[] } {
  const last = new Map<string, number>();
  rows.forEach((r, i) => last.set(key(r), i));
  const out: T[] = [];
  const duplicates: T[] = [];
  rows.forEach((r, i) => (last.get(key(r)) === i ? out.push(r) : duplicates.push(r)));
  return { rows: out, duplicates };
}
