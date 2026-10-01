// Module registry: every business module the platform shell knows about, in
// sidebar order. To add a module, write its manifest in ./manifests and add it
// here; the sidebar, module hub, route guard and permission map all derive
// from this list.

import type { ModuleManifest } from "@/lib/modules/types";
import { projectModule } from "@/lib/modules/manifests/project";
import { reportingModule } from "@/lib/modules/manifests/reporting";
import { documentControlModule } from "@/lib/modules/manifests/document-control";
import { planningModule } from "@/lib/modules/manifests/planning";
import { designModule } from "@/lib/modules/manifests/design";
import { procurementModule } from "@/lib/modules/manifests/procurement";
import { inventoryModule } from "@/lib/modules/manifests/inventory";
import { qsModule } from "@/lib/modules/manifests/qs";
import { constructionModule } from "@/lib/modules/manifests/construction";
import { hrModule } from "@/lib/modules/manifests/hr";
import { accountModule } from "@/lib/modules/manifests/account";
import { administrationModule } from "@/lib/modules/manifests/administration";

export const MODULE_REGISTRY: ModuleManifest[] = [
  projectModule,
  reportingModule,
  documentControlModule,
  planningModule,
  designModule,
  procurementModule,
  inventoryModule,
  qsModule,
  constructionModule,
  hrModule,
  accountModule,
  administrationModule,
];

// The same modules in module-hub card order.
export const HUB_MODULES: ModuleManifest[] = [...MODULE_REGISTRY].sort(
  (a, b) => a.hub.order - b.hub.order,
);

export function getModule(key: string): ModuleManifest | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key);
}

// The module whose route prefix matches pathname, if any.
export function getModuleForPath(pathname: string): ModuleManifest | undefined {
  return MODULE_REGISTRY.find((m) =>
    m.routePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/")),
  );
}
