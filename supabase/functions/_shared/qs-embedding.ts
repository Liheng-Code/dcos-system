// Shared helpers for the QS library search edge functions.
// gte-small (384-dim) runs inside the Supabase edge runtime via Supabase.ai —
// no external API and no API key. It must match the vector(384) column in
// public.qs_library_search.

declare const Supabase: {
  ai: { Session: new (model: string) => { run: (input: string, opts: { mean_pool: boolean; normalize: boolean }) => Promise<number[]> } };
};

let session: { run: (input: string, opts: { mean_pool: boolean; normalize: boolean }) => Promise<number[]> } | null = null;

export async function embed(text: string): Promise<number[]> {
  if (!session) session = new Supabase.ai.Session("gte-small");
  const out = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(out);
}

// pgvector literal accepted by PostgREST for a vector column / argument.
export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
