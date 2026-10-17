// Module manifest contract. One manifest per business module (see ./manifests)
// is the single source of truth for what the platform shell needs to know about
// it: its module_settings key, its RBAC codes, the routes it owns, and how it
// appears in the sidebar and the module hub. The shell (sidebar, module hub,
// route guard, permitted-modules hook) reads everything from ./registry.

import type { LucideIcon } from "lucide-react";
import type { FeatureStatus, ModuleNavGroup } from "@/lib/module-nav";

// A leaf link rendered directly under the module heading (Project and
// Administration use these instead of nav groups).
export interface ModuleNavLeaf {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  status?: FeatureStatus;
}

export interface ModuleHubCard {
  title: string;
  description: string;
  href: string;
  // Entry point used while a tender project is selected.
  precontractHref?: string;
  icon: LucideIcon;
  gradient: string;
  // Position on the module hub (it differs from the sidebar order).
  order: number;
  // Only users with profiles.role = "admin" see the card.
  adminOnly?: boolean;
}

export interface ModuleManifest {
  // Matches public.module_settings.module_key.
  key: string;
  // Sidebar heading.
  name: string;
  // public.role_permissions.module codes that govern this module. Empty means
  // no RBAC code governs it and it is always treated as permitted.
  rbacModules: string[];
  // Whether the dashboard route guard applies to this module's routes at all (the
  // module toggle, the feature toggles and the role check). False only for
  // Administration, which must stay reachable so the toggles can be undone.
  roleGoverned: boolean;
  // Route prefixes the dashboard route guard attributes to this module.
  routePrefixes: string[];
  // "admin_or_hr": the sidebar section is gated by (isAdmin || isHr) and the
  // global module toggle, not by the role-permission check.
  sidebarGate?: "admin_or_hr";
  // Sidebar shows one item per group; the module header shows the group's pages as tabs.
  navGroups?: ModuleNavGroup[];
  // Icon per nav group key. A group with no icon is not rendered in the sidebar.
  groupIcons?: Record<string, LucideIcon>;
  navItems?: ModuleNavLeaf[];
  hub: ModuleHubCard;
}
