/**
 * Resolves the `redirectTo` URL passed to Supabase's `inviteUserByEmail()` /
 * `resetPasswordForEmail()` / `generateLink()` calls.
 *
 * Per the Phase 3 brief: this module's job is only to accept and honor a `redirectTo`
 * parameter, pointing at whatever `/reset-password` (or `/login`) route Phase 4 builds
 * (`06-UI-UX-Design.md`'s route table names `/reset-password` for both first-activation and
 * routine reset completion). We never hardcode what happens after the link is followed —
 * only make the target configurable:
 *
 * 1. An explicit `redirect_to` in the request body always wins.
 * 2. Otherwise, if `NEXT_PUBLIC_APP_URL` (or `NEXT_PUBLIC_SITE_URL`) is set, build
 *    `${base}/reset-password` from it.
 * 3. Otherwise, return `undefined` and let Supabase fall back to the project's
 *    dashboard-configured Site URL / redirect allow list — never throw for a missing env var.
 */
export function resolveRedirectTo(explicit?: string | null): string | undefined {
  if (explicit) return explicit;

  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return undefined;

  return `${base.replace(/\/+$/, "")}/reset-password`;
}
