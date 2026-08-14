// Shared types + active-group resolution for the flat module navigation
// pattern (sidebar shows one item per group, the module header shows the
// group's child pages as tabs). Used by procurement, inventory and QS.

export interface ModuleNavTabItem {
  label: string;
  href: string;
  // Optional sub-items shown in a hover dropdown under this tab (e.g. the QS
  // Cost Control tab exposes Cost Dashboard / Budget & Variance / etc. this way
  // instead of a second nested tab control on the page itself).
  children?: ModuleNavTabItem[];
}

export interface ModuleNavGroup {
  key: string;
  navKey: string;
  label: string;
  href: string;
  items: ModuleNavTabItem[];
  // When provided the group is only considered while the predicate returns
  // true (e.g. QS groups that only exist during the pre-contract phase).
  visible?: (ctx: ModuleNavContext) => boolean;
}

export interface ModuleNavContext {
  isPrecontract: boolean;
}

// Returns the group whose tab route is the longest prefix match for pathname.
// This matters because a module's dashboard route (e.g. "/dashboard/procurement")
// is a prefix of every route in that module, so a plain "some/startsWith" check
// would always resolve to the first group. Picking the longest matching route
// keeps the active group correct for every page (including nested routes).
// hrefs may include a "?tab=" query (e.g. "/dashboard/qs?tab=cost-control");
// only the path portion is used for group matching.
export function getActiveModuleGroup(
  groups: ModuleNavGroup[],
  pathname: string,
  ctx: ModuleNavContext = { isPrecontract: false },
): ModuleNavGroup | null {
  let active: ModuleNavGroup | null = null;
  let bestLength = -1;
  for (const group of groups) {
    if (group.visible && !group.visible(ctx)) continue;
    for (const item of group.items) {
      const hrefPath = item.href.split("?")[0];
      if (pathname === hrefPath || pathname.startsWith(hrefPath + "/")) {
        if (hrefPath.length > bestLength) {
          bestLength = hrefPath.length;
          active = group;
        }
      }
    }
  }
  return active;
}
