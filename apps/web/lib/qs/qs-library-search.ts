import { createClient } from "@/lib/supabase/client";

// Client for the hybrid QS library search (public.search_qs_library).
// Tries the qs-library-search edge function first (keyword + gte-small vector
// ranking); if the function is unavailable (not deployed, model not loaded,
// network) it falls back to calling the RPC directly with no embedding, which
// is keyword-only (full-text + trigram). Both paths run as the signed-in user,
// so the index's tenant RLS applies.

export type QsLibrarySourceType = "resource" | "element" | "element_description";

export interface QsLibrarySearchResult {
  source_type: QsLibrarySourceType;
  source_id: string;
  title: string;
  subtitle: string | null;
  score: number;
  match_kinds: string[];
}

export interface QsLibrarySearchResponse {
  results: QsLibrarySearchResult[];
  mode: "hybrid" | "keyword";
}

export async function searchQsLibrary(
  query: string,
  types: QsLibrarySourceType[] | null = null,
  limit = 50,
): Promise<QsLibrarySearchResponse> {
  const supabase = createClient();
  const q = query.trim();
  if (q.length < 2) return { results: [], mode: "keyword" };

  try {
    const { data, error } = await supabase.functions.invoke("qs-library-search", {
      body: { query: q, types, limit },
    });
    if (!error && data && Array.isArray(data.results)) {
      return { results: data.results as QsLibrarySearchResult[], mode: data.embeddingUsed ? "hybrid" : "keyword" };
    }
  } catch {
    // fall through to the keyword-only RPC
  }

  const { data, error } = await supabase.rpc("search_qs_library", {
    p_query: q,
    p_embedding: undefined,
    p_types: types ?? undefined,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return { results: (data ?? []) as QsLibrarySearchResult[], mode: "keyword" };
}

export interface QsSearchIndexRefreshResult {
  embedded: number;
  remaining: number | null;
}

// Fills missing embeddings (rows added or changed since the last run). Each
// call embeds a small slice (the edge runtime caps CPU per request), so this
// loops until nothing is pending or `maxRounds` is reached (~2 minutes).
export async function refreshQsSearchIndex(maxRounds = 40): Promise<QsSearchIndexRefreshResult> {
  const supabase = createClient();
  let embedded = 0;
  let remaining: number | null = null;
  for (let round = 0; round < maxRounds; round++) {
    const { data, error } = await supabase.functions.invoke("qs-library-embed", { body: {} });
    if (error) throw new Error(error.message ?? "Search index refresh failed");
    embedded += Number(data?.embedded ?? 0);
    remaining = data?.remaining ?? null;
    if (!remaining || Number(data?.embedded ?? 0) === 0) break;
  }
  return { embedded, remaining };
}
