// Deploy-time module selection. Which business modules a deployment ships is
// chosen with one environment variable, read when the app is built:
//
//   DCOS_ENABLED_MODULES=qs,planning     only these modules (plus the always-on ones)
//   DCOS_ENABLED_MODULES unset / "all"   every module (local development default)
//
// "project" and "administration" are the platform itself and are always on.
// Module keys are the module_settings keys (see module-boundaries.mjs).
//
// A module that is off is removed from the sidebar and module hub (lib/modules/
// registry.ts) and every page and API route it owns is redirected or answered
// with 404 (next.config.ts). Its code is still in the bundle: Project imports
// parts of QS and Planning, so this hides modules, it does not tree-shake them.
// This is not a data boundary; RLS still protects the tables.

import { MODULE_PATHS } from "./module-boundaries.mjs";

export const ALWAYS_ON = ["project", "administration"];
export const KNOWN_MODULES = [...ALWAYS_ON, ...Object.keys(MODULE_PATHS)];

/**
 * Parse DCOS_ENABLED_MODULES. Returns null when every module is enabled,
 * otherwise the set of enabled keys. Throws on an unknown key so a typo fails
 * the build instead of silently hiding a module.
 * @param {string | undefined} raw
 * @returns {Set<string> | null}
 */
export function parseEnabledModules(raw) {
  const value = (raw ?? "").trim();
  if (value === "" || value.toLowerCase() === "all") return null;
  const keys = value.split(",").map((k) => k.trim()).filter(Boolean);
  const unknown = keys.filter((k) => !KNOWN_MODULES.includes(k));
  if (unknown.length > 0) {
    throw new Error(
      `DCOS_ENABLED_MODULES has unknown module(s): ${unknown.join(", ")}. ` +
        `Valid keys: ${KNOWN_MODULES.join(", ")}.`,
    );
  }
  return new Set([...ALWAYS_ON, ...keys]);
}

/**
 * @param {Set<string> | null} enabled result of parseEnabledModules
 * @param {string} key
 */
export function isModuleEnabled(enabled, key) {
  return enabled === null || enabled.has(key);
}

/**
 * URL prefixes owned by modules that are off, from the app/ folders listed in
 * MODULE_PATHS (app/dashboard/hr -> /dashboard/hr, app/api/hr -> /api/hr).
 * @param {Set<string> | null} enabled
 * @returns {{ module: string, source: string }[]}
 */
export function disabledRoutes(enabled) {
  if (enabled === null) return [];
  const routes = [];
  for (const [module, paths] of Object.entries(MODULE_PATHS)) {
    if (enabled.has(module)) continue;
    for (const p of paths) {
      if (!p.startsWith("app/") || /\.\w+$/.test(p)) continue;
      routes.push({ module, source: "/" + p.slice("app/".length) });
    }
  }
  return routes;
}
