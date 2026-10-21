// Runs an `.in(column, ids)` query in batches. PostgREST filters travel in the URL and the Supabase gateway
// rejects URLs over ~8 KB (414) at about 215 uuids, which the browser reports as a network error and
// supabase-js retries with backoff, so a long id list stalls the page for seconds and then fails.

const CHUNK = 150;

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Reads `run(part)` for each batch of ids and concatenates the rows. Batches run in parallel. */
export async function inChunks<T>(ids: readonly string[], run: (part: string[]) => Result<T>): Promise<T[]> {
  if (!ids.length) return [];
  const parts: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) parts.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(parts.map((p) => run(p)));
  const out: T[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

const PAGE = 1000;

/**
 * Reads every row of a query page by page. PostgREST returns at most `max_rows` (1000, supabase/config.toml)
 * per request, so a project-wide read of tasks or nodes is cut short without this. The query must have a
 * stable order (e.g. `.order("id")`).
 */
export async function allPages<T>(run: (from: number, to: number) => Result<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

/** Runs a write (update / delete) for each batch of ids. */
export async function eachChunk(ids: readonly string[], run: (part: string[]) => PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await run(ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
  }
}
