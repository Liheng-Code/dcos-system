"use client";

import { useEffect, useRef, useState } from "react";

interface CachedPayload<T> {
  data: T;
  fetchedAt: string;
}

function readCache<T>(key: string): CachedPayload<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CachedPayload<T>) : null;
  } catch {
    return null; // corrupt/unavailable storage — treat as a cache miss
  }
}

function writeCache<T>(key: string, data: T): string {
  const fetchedAt = new Date().toISOString();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, JSON.stringify({ data, fetchedAt }));
    } catch {
      /* storage full/unavailable — the cache is best-effort only */
    }
  }
  return fetchedAt;
}

/**
 * Loads `fetchFn`'s result once per `cacheKey`, then only fetches again when
 * `refreshToken` changes for that same key — never merely on remount. The
 * last successful result is persisted to `localStorage` under `cacheKey`, so
 * a fresh page load (even after closing the browser) restores it instantly
 * instead of re-fetching. This is the building block behind the Planning
 * Dashboard's single "Refresh" button: every chart card owns one cache
 * entry, and the page bumps one shared `refreshToken` to update them all.
 *
 * Pass `cacheKey: null` to disable entirely (e.g. no project selected yet).
 */
export function useCachedFetch<T>(
  cacheKey: string | null,
  fetchFn: () => Promise<T>,
  refreshToken: number | string = 0,
): { data: T | null; loading: boolean; fetchedAt: string | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appliedRef = useRef<{ key: string; token: number | string } | null>(null);

  useEffect(() => {
    if (!cacheKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing local state when disabled (no project selected)
      setData(null);
      setFetchedAt(null);
      setLoading(false);
      setError(null);
      appliedRef.current = null;
      return;
    }

    const prev = appliedRef.current;
    const sameContext = !!prev && prev.key === cacheKey;

    if (sameContext && prev.token === refreshToken) {
      return; // already up to date for this key + token — nothing to do
    }

    if (!sameContext) {
      // Entering a new key (project/params changed) — trust the cache before fetching.
      const cached = readCache<T>(cacheKey);
      if (cached) {
        setData(cached.data);
        setFetchedAt(cached.fetchedAt);
        setError(null);
        setLoading(false);
        appliedRef.current = { key: cacheKey, token: refreshToken };
        return;
      }
    }

    // Either a brand-new key with nothing cached yet, or an explicit refresh
    // (token changed) for the same key — go fetch.
    let cancelled = false;
    appliedRef.current = { key: cacheKey, token: refreshToken };
    setLoading(true);
    setError(null);
    fetchFn()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setFetchedAt(writeCache(cacheKey, result));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchFn is intentionally not a dep: callers pass a fresh closure each render, and appliedRef already gates re-fetching to real key/token changes only
  }, [cacheKey, refreshToken]);

  return { data, loading, fetchedAt, error };
}
