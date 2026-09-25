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
  // A hidden item still claims its route for active-group resolution (so the page keeps
  // its header tabs and sidebar highlight) but is not rendered as a tab. Use it for
  // advanced pages that are reached from another page rather than from the tab bar.
  hidden?: boolean;
  // When provided the item is only rendered while the predicate returns true (e.g.
  // execution-only Planning pages that are hidden during the pre-contract phase).
  visible?: (ctx: ModuleNavContext) => boolean;
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

function filterItems(items: ModuleNavTabItem[], ctx: ModuleNavContext): ModuleNavTabItem[] {
  return items
    .filter(item => !item.visible || item.visible(ctx))
    .map(item => (item.children ? { ...item, children: filterItems(item.children, ctx) } : item));
}

// Returns a copy of the group with items (and their children) whose `visible`
// predicate fails for ctx removed, ready to hand to ModuleHeaderTabs.
export function filterGroupItems(group: ModuleNavGroup | null, ctx: ModuleNavContext): ModuleNavGroup | null {
  if (!group) return null;
  return { ...group, items: filterItems(group.items, ctx) };
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
