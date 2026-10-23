import { ForbiddenError } from "@/lib/auth";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

// Turns thrown errors into a result the form can show. Unexpected errors are
// logged on the server and reported generically.
export function toFailure(err: unknown, context: string): ActionResult<never> {
  if (err instanceof ForbiddenError) return fail(err.message);
  if (err instanceof Error && err.name === "ZodError") return fail("Some fields are invalid.");
  console.error(`[hq] ${context}:`, err);
  return fail(err instanceof Error ? err.message : "Something went wrong.");
}
