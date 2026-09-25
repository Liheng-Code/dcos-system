import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, embed, json, toVectorLiteral } from "../_shared/qs-embedding.ts";

// Fills qs_library_search.embedding for rows whose embedding is null (new or
// changed rows — the sync triggers null it when the text changes). Runs in
// batches until nothing is pending or the time budget is used up; the caller
// re-invokes while `remaining > 0`. Rows without an embedding still match by
// keyword, so a lag here only reduces synonym matching.

// The edge runtime cancels a request that uses too much CPU (~10 s locally, less
// on the hosted platform), and embedding is CPU-bound, so each request does a
// small slice and returns; callers loop while `remaining > 0`. Tunable per
// environment with QS_EMBED_TIME_BUDGET_MS.
const BATCH = 10;
const TIME_BUDGET_MS = Number(Deno.env.get("QS_EMBED_TIME_BUDGET_MS") ?? "700");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Any signed-in user may trigger a refresh (the app gates the button by
  // qs_libraries.edit); the service role below only writes derived vectors.
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const started = Date.now();
  let embedded = 0;
  const failures: string[] = [];

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: rows, error } = await admin
      .from("qs_library_search")
      .select("id, search_text")
      .is("embedding", null)
      .limit(BATCH);
    if (error) return json({ error: error.message, embedded }, 500);
    if (!rows || rows.length === 0) break;

    let progressed = false;
    for (const row of rows) {
      try {
        const vector = toVectorLiteral(await embed(row.search_text));
        const { error: upErr } = await admin
          .from("qs_library_search")
          .update({ embedding: vector, embedded_at: new Date().toISOString() })
          .eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        embedded++;
        progressed = true;
      } catch (e) {
        failures.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (Date.now() - started >= TIME_BUDGET_MS) break;
    }
    // Every row in the batch failed: stop rather than spin on the same rows.
    if (!progressed) break;
  }

  const { count } = await admin
    .from("qs_library_search")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  return json({ embedded, remaining: count ?? null, failures: failures.slice(0, 10) });
});
