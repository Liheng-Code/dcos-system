/**
 * Shared typed error for the USR (User Management & Account Lifecycle) API routes.
 *
 * Service-layer functions throw `ApiError` for any client-facing failure; route handlers
 * catch it and translate `status`/`code`/`message` into the standard
 * `{ error, code }` response shape documented in
 * `docs/04-Business-Modules/02-USR-User-Management/08-API-Reference.md`.
 *
 * Never let a raw Supabase/Postgres error reach the client — wrap it in an `ApiError`
 * (or a generic 500) instead.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Type guard for narrowing `unknown` catch values to `ApiError`. */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
