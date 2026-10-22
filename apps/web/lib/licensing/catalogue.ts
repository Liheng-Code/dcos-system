// Which tenant-app routes each entitlement governs. The catalogue itself (keys,
// labels, always-on modules) lives in packages/licensing, shared with DCOS HQ.
// Design: docs/01-DCOS-Foundation/DCOS-Licensing-Control-Plane-Design.md 3.2, 7.2.

// Kept free of the module registry (and its icons) so proxy.ts can import it.
import { moduleOf } from "../../module-boundaries.mjs";
import { ALWAYS_ON_MODULES, FEATURE_ENTITLEMENTS, MODULE_ENTITLEMENTS } from "@dcos/licensing/catalogue";

export * from "@dcos/licensing/catalogue";

const SPLIT_MODULES = MODULE_ENTITLEMENTS.filter((m) => m.pathPrefixes);

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// Module entitlement that governs a page or API path, or null for core paths.
export function entitlementForPath(pathname: string): string | null {
  for (const m of SPLIT_MODULES) {
    if (m.pathPrefixes!.some((p) => underPrefix(pathname, p))) return m.key;
  }
  const owner = moduleOf("app" + pathname);
  if (owner === "core") return null;
  // A split manifest's path that no sub-entitlement claims belongs to its base key.
  return owner;
}

// Feature entitlement required by an API path, if any. "[id]" matches one segment.
export function featureForApiPath(pathname: string): string | null {
  for (const f of FEATURE_ENTITLEMENTS) {
    for (const prefix of f.apiPrefixes) {
      const re = new RegExp("^" + prefix.replace(/\[[^\]]+\]/g, "[^/]+") + "(/|$)");
      if (re.test(pathname)) return f.key;
    }
  }
  return null;
}

// True when the manifest has at least one licensed entitlement.
export function isManifestLicensed(manifestKey: string, modules: ReadonlySet<string>): boolean {
  return MODULE_ENTITLEMENTS.some(
    (m) => m.manifestKey === manifestKey && (m.alwaysOn || modules.has(m.key)),
  );
}

export function isPathLicensed(pathname: string, modules: ReadonlySet<string>): boolean {
  const key = entitlementForPath(pathname);
  return key === null || ALWAYS_ON_MODULES.includes(key) || modules.has(key);
}
