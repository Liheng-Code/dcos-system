import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, embed, json, toVectorLiteral } from "../_shared/qs-embedding.ts";

// Hybrid QS library search: embeds the query with gte-small, then calls
// public.search_qs_library with the caller's JWT so the index's tenant RLS
// applies. If embedding fails the RPC still runs keyword-only (p_embedding
// null), and the response says so via embeddingUsed.

interface SearchBody {
  query?: string;
  types?: string[] | null;
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  let body: SearchBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const query = (body.query ?? "").trim();
  if (query.length < 2) return json({ results: [], embeddingUsed: false });
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);

  let embedding: string | null = null;
  let embeddingError: string | null = null;
  try {
    embedding = toVectorLiteral(await embed(query));
  } catch (e) {
    embeddingError = e instanceof Error ? e.message : String(e);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await supabase.rpc("search_qs_library", {
    p_query: query,
    p_embedding: embedding,
    p_types: body.types && body.types.length > 0 ? body.types : null,
    p_limit: limit,
  });
  if (error) return json({ error: error.message }, 400);

  return json({ results: data ?? [], embeddingUsed: embedding !== null, embeddingError });
});
