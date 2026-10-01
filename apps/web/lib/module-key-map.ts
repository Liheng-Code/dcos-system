import { MODULE_REGISTRY } from "@/lib/modules/registry";

/**
 * Sidebar module key -> RBAC module code mapping (Phase A — Sidebar/Nav Visibility Fix).
 *
 * `public.module_settings.module_key` (the sidebar's global on/off vocabulary, see
 * `apps/web/components/dashboard/sidebar.tsx` and `apps/web/lib/module-settings-service.ts`)
 * and `public.role_permissions.module` (the RBAC vocabulary, see the `MODULES` const in
 * `apps/web/components/settings/role-permissions-page.tsx`) are two different, only
 * partially-overlapping vocabularies. This map bridges them so the sidebar can be filtered
 * by what the current user's role is actually permitted to see, not just by the global toggle.
 *
 * This is a UI-visibility mapping only — it is not a security boundary. Nothing downstream
 * of this map enforces access at the API or RLS layer (that is Phase B, out of scope here).
 *
 * A sidebar key mapped to an empty array has no RBAC module governing it at all and is
 * always treated as permitted (default-allow) by `usePermittedModules()` —
 * `design` is the confirmed case today: no `role_permissions` row anywhere uses a
 * design/bim module code (verified directly against every `insert into
 * public.role_permissions` in supabase/migrations, not assumed).
 *
 * Investigation also found that several of the RBAC codes below — `construction`,
 * `qa_qc`, `hse`, `account_finance`, `planning`, `reporting_kpi` — currently have ZERO
 * seeded `role_permissions` rows for ANY role, exactly like `design`. `usePermittedModules()`
 * treats those the same as an empty array (default-allow) at runtime so that Construction /
 * Account / Planning / Reporting don't vanish from every user's sidebar the moment this map
 * ships, before Phase B seeds a real matrix for them — see the comment in
 * `apps/web/hooks/use-permitted-modules.ts` for how that's detected. The arrays below are
 * still written as the topically-correct mapping (not hollowed out to `[]`) so that this file
 * stays the accurate source of truth once those modules are seeded in Phase B.
 *
 * `administration` is included for documentation completeness only. Phase A deliberately does
 * NOT wire it into `isModulePermitted()` — the Administration folder in sidebar.tsx keeps its
 * existing, unrelated `(isAdmin || isHr) && isModuleActive("administration")` gate untouched,
 * and the direct-URL guard in `module-settings-service.ts` excludes it from the new role check
 * for the same reason (see `ROLE_GOVERNED_MODULE_KEYS` there).
 *
 * Two RBAC module codes exist in seeded data but are NOT part of the admin UI's editable
 * `MODULES` list (and so are intentionally excluded from this map, which only uses that
 * vocabulary): `qto` (seeded separately from `qs`/`tender` in
 * `20260805000002_seed_qto_rbac.sql`) and `master_libraries` (granted broadly across internal
 * hierarchy levels L0-L6 in `20260624000001_master_libraries.sql`, not specific to one sidebar
 * section). `commissioning_handover` has no corresponding top-level sidebar section today, so
 * it is not mapped to anything here either.
 *
 * The mapping itself now lives on each module's manifest (`rbacModules` in
 * `apps/web/lib/modules/manifests/*`); this map is derived from the registry.
 */
export const MODULE_KEY_MAP: Record<string, string[]> = Object.fromEntries(
  MODULE_REGISTRY.map((m) => [m.key, m.rbacModules]),
);

/** Every distinct RBAC module code referenced anywhere in `MODULE_KEY_MAP`. */
export const ALL_MAPPED_RBAC_MODULES: string[] = Array.from(
  new Set(Object.values(MODULE_KEY_MAP).flat()),
);
