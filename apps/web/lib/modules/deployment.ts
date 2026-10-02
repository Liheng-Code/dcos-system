// Which modules this deployment ships. DCOS_ENABLED_MODULES is chosen before a
// deploy and inlined at build time as NEXT_PUBLIC_DCOS_ENABLED_MODULES by
// next.config.ts. See module-deployment.mjs for the rules.

import { isModuleEnabled, parseEnabledModules } from "../../module-deployment.mjs";

const ENABLED = parseEnabledModules(process.env.NEXT_PUBLIC_DCOS_ENABLED_MODULES);

export function isModuleDeployed(key: string): boolean {
  return isModuleEnabled(ENABLED, key);
}
