"use client";

import { useEffect, useMemo, useState } from "react";
import { searchQsLibrary, type QsLibrarySourceType, type QsLibrarySearchResult } from "@/lib/qs-library-search";

export interface QsLibrarySearchState {
  // Ranked matches keyed by source_id (lower index = better), or null when the
  // query is too short or the search failed — callers then keep their own
  // client-side filter.
  ranks: Map<string, number> | null;
  results: QsLibrarySearchResult[];
  mode: "hybrid" | "keyword" | null;
  searching: boolean;
}

// Debounced hybrid search over the QS library index. Active from 2 characters.
export function useQsLibrarySearch(
  query: string,
  types: QsLibrarySourceType[],
  limit = 100,
): QsLibrarySearchState {
  const typesKey = types.join(",");
  const [state, setState] = useState<{ key: string; results: QsLibrarySearchResult[]; mode: "hybrid" | "keyword" | null; failed: boolean }>({
    key: "",
    results: [],
    mode: null,
    failed: false,
  });

  const q = query.trim();
  const key = `${typesKey}::${limit}::${q}`;
  const active = q.length >= 2;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      searchQsLibrary(q, typesKey ? (typesKey.split(",") as QsLibrarySourceType[]) : null, limit)
        .then((res) => { if (!cancelled) setState({ key, results: res.results, mode: res.mode, failed: false }); })
        .catch(() => { if (!cancelled) setState({ key, results: [], mode: null, failed: true }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [active, q, typesKey, limit, key]);

  const current = active && state.key === key;
  const ranks = useMemo(() => {
    if (!current || state.failed) return null;
    return new Map(state.results.map((r, i) => [r.source_id, i]));
  }, [current, state]);

  return {
    ranks,
    results: current ? state.results : [],
    mode: current ? state.mode : null,
    searching: active && !current,
  };
}
