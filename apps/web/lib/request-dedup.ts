/**
 * Collapses concurrent calls to the same key into one in-flight request.
 * Not a cache — nothing is stored once a call settles, so a call made after
 * the previous one has already resolved always fetches fresh. This only
 * fixes the specific "N siblings mount at once and each independently kicks
 * off the same expensive fetch" waste (e.g. the Planning Dashboard's
 * LevellingDiagramCard/CostLevellingDiagramCard both calling
 * loadLevellingContext(projectId) within the same render pass) — it never
 * introduces staleness.
 */
const inflight = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
