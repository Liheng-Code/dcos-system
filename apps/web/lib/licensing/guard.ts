// Request-level license rules for API routes (design sections 5.3 and 7.3, E2/E3).
// Pure, so proxy.ts and the tests share it.

import type { EffectiveLicense } from "@/lib/licensing/effective";
import type { LicenseDenial } from "@/lib/licensing/errors";
import { entitlementForPath, featureForApiPath, isPathLicensed, moduleLabel, featureLabel } from "@/lib/licensing/catalogue";

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// Always reachable: sign-in and password flows, and the license itself, so a
// locked deployment can still be renewed.
const ALWAYS_ALLOWED = ["/api/auth", "/api/license"];

// Site data sent in by bots and the field app. Kept working through read-only so
// attendance and daily reports are not silently lost; stopped once locked
// (owner decision 12, recommended default).
const INGESTION = [
  "/api/telegram",
  "/api/dr/telegram/webhook",
  "/api/dr/sync",
  "/api/dr/cron",
  "/api/hr/attendance",
];

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function lockedDenial(eff: EffectiveLicense): LicenseDenial {
  if (eff.state === "suspended") {
    return { code: "LIC_SUSPENDED", message: eff.notice ?? "This DCOS deployment is suspended." };
  }
  if (eff.state === "unlicensed") {
    return {
      code: "LIC_UNVERIFIED",
      message: eff.tokenError ?? "No valid DCOS license is installed. An administrator can install one under Administration > License.",
    };
  }
  return { code: "LIC_LOCKED", message: "The DCOS license has expired. An administrator can renew it under Administration > License." };
}

export function checkApiRequest(eff: EffectiveLicense, method: string, pathname: string): LicenseDenial | null {
  if (eff.mode === "off") return null;
  if (ALWAYS_ALLOWED.some((p) => under(pathname, p))) return null;

  if (eff.access === "locked") return lockedDenial(eff);

  const moduleSet = new Set(eff.modules);
  if (!isPathLicensed(pathname, moduleSet)) {
    const key = entitlementForPath(pathname)!;
    return { code: "LIC_MODULE_NOT_LICENSED", message: `${moduleLabel(key)} is not included in this DCOS license.` };
  }
  const feature = featureForApiPath(pathname);
  if (feature && !eff.features.includes(feature)) {
    return { code: "LIC_FEATURE_NOT_LICENSED", message: `${featureLabel(feature)} is not included in this DCOS license.` };
  }

  const ingestion = INGESTION.some((p) => under(pathname, p));
  if (eff.access === "readonly" && !READ_METHODS.has(method.toUpperCase()) && !ingestion) {
    if (eff.state === "suspended") {
      return { code: "LIC_SUSPENDED", message: eff.notice ?? "This DCOS deployment is suspended: read-only." };
    }
    return { code: "LIC_READ_ONLY", message: "The DCOS license has expired: data is read-only until it is renewed." };
  }
  return null;
}

// Page paths a locked deployment still serves, so an administrator can renew.
export function isPageAllowedWhenLocked(pathname: string): boolean {
  return (
    under(pathname, "/dashboard/administration/license") ||
    under(pathname, "/dashboard/license") ||
    under(pathname, "/dashboard/profile")
  );
}
