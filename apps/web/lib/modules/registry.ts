// Module registry: every business module the platform shell knows about, in
// sidebar order. To add a module, write its manifest in ./manifests and add it
// here; the sidebar, module hub, route guard and permission map all derive
// from this list.

import type { ModuleManifest } from "@/lib/modules/types";
import { isModuleDeployed } from "@/lib/modules/deployment";
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

// Every module, deployed or not.
const ALL_MODULES: ModuleManifest[] = [
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

// The modules this deployment ships (DCOS_ENABLED_MODULES; all when unset). A module
// left out disappears from the sidebar and hub; next.config.ts blocks its routes.
export const MODULE_REGISTRY: ModuleManifest[] = ALL_MODULES.filter((m) => isModuleDeployed(m.key));

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
