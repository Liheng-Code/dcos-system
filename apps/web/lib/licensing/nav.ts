// License checks for the sidebar, module hub and Module Settings, which work in
// nav keys and manifest keys rather than paths.

import { MODULE_FEATURES } from "@/lib/modules/features";
import { isManifestLicensed, isPathLicensed } from "@/lib/licensing/catalogue";

// A nav item is licensed when its route is; a nav group when any of its pages is.
export function isNavKeyLicensed(navKey: string, modules: ReadonlySet<string>): boolean {
  const features = MODULE_FEATURES.filter((f) => f.navKey === navKey);
  if (features.length === 0) return true;
  return features.some((feature) => {
    if (feature.nodeType === "group") {
      const pages = MODULE_FEATURES.filter((f) => f.parentGroupKey === navKey);
      if (pages.length === 0) return isManifestLicensed(feature.moduleKey, modules);
      return pages.some((p) => isPathLicensed(p.navKey.split("?")[0], modules));
    }
    return isPathLicensed(feature.navKey.split("?")[0], modules);
  });
}
