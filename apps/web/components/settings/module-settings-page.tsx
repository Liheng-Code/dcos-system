"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  BarChart2,
  FileText,
  CalendarRange,
  PenTool,
  ShoppingCart,
  Calculator,
  HardHat,
  Users,
  Landmark,
  Settings,
  Loader2,
  Lock,
  Info,
  ListTree,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ModuleSetting } from "@/lib/module-settings-service";
import { getModuleSettings } from "@/lib/module-settings-service";
import { NAV_ITEM_CATALOG, type NavCatalogEntry } from "@/lib/nav-item-catalog";
import { useModuleSettings } from "@/contexts/module-settings-context";

const MODULE_ICONS: Record<string, typeof LayoutDashboard> = {
  project: LayoutDashboard,
  reporting: BarChart2,
  document_control: FileText,
  planning: CalendarRange,
  design: PenTool,
  procurement: ShoppingCart,
  qs: Calculator,
  construction: HardHat,
  hr: Users,
  account: Landmark,
  administration: Settings,
};

export function ModuleSettingsPage() {
  const [modules, setModules] = useState<ModuleSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  // Live toggle state comes from the shared context, which is kept in sync by the
  // realtime postgres_changes subscription — toggling updates the sidebar + module
  // hub everywhere without a page refresh.
  const { isModuleActive, toggleModule, loading: contextLoading } = useModuleSettings();

  useEffect(() => {
    getModuleSettings(true).then((data) => {
      setModules(data);
      setLoading(false);
    });
  }, []);

  async function handleToggle(moduleKey: string, currentActive: boolean) {
    if (moduleKey === "administration") {
      toast.error("The Administration module cannot be disabled.");
      return;
    }

    const newActive = !currentActive;
    setToggling(moduleKey);

    const result = await toggleModule(moduleKey, newActive);
    setToggling(null);

    if (result.success) {
      toast.success(
        `${newActive ? "Enabled" : "Disabled"} ${modules.find((m) => m.module_key === moduleKey)?.display_name}`
      );
    } else {
      toast.error(result.error ?? "Failed to update module.");
    }
  }

  if (loading || contextLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeCount = modules.filter((m) => isModuleActive(m.module_key)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Module Visibility</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Toggle modules on or off globally. Disabled modules are hidden from the sidebar
            and the module hub for all users; their routes remain reachable by direct URL.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {activeCount}/{modules.length} active
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const Icon = MODULE_ICONS[mod.module_key] ?? Settings;
          const isToggling = toggling === mod.module_key;
          const isProtected = mod.module_key === "administration";
          const isActive = isModuleActive(mod.module_key);

          return (
            <Card
              key={mod.module_key}
              className={cn(
                "relative transition-all duration-200",
                !isActive && "opacity-60"
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{mod.display_name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {mod.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    {isProtected && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Always on
                      </span>
                    )}
                    {!isProtected && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Info className="h-3 w-3" />
                        {isActive ? "Visible in sidebar & hub" : "Hidden from sidebar & hub"}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isProtected || isToggling}
                    onClick={() => handleToggle(mod.module_key, isActive)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                      isActive ? "bg-orange-500" : "bg-input"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
                        isActive ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
                {(NAV_ITEM_CATALOG[mod.module_key]?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <Dialog>
                      <DialogTrigger
                        render={<Button variant="outline" size="sm" className="w-full gap-1.5" />}
                      >
                        <ListTree className="h-3.5 w-3.5" />
                        Manage navigation items
                      </DialogTrigger>
                      <NavItemsDialogContent
                        moduleKey={mod.module_key}
                        displayName={mod.display_name}
                      />
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <strong>Note:</strong> Disabling a module hides it from the navigation sidebar and the module hub. Direct URL access to a disabled module still works — this control affects visibility, not access. Admins will still see disabled modules in this settings page. The Administration module is always active and cannot be turned off.
      </div>
    </div>
  );
}

// ── Per-module "Manage navigation items" dialog ──────────────────────────────
// Lists this module's sub-group headings and leaf links (from the static
// NAV_ITEM_CATALOG) with the same raw pill-switch markup used above, scaled
// down slightly to fit a denser list. Checked state is joined against
// navItemSettings from context — absent from that array means visible by
// default, exactly mirroring isNavItemActive's `?? true` fallback.
function NavItemsDialogContent({ moduleKey, displayName }: { moduleKey: string; displayName: string }) {
  const { isNavItemActive, toggleNavItem } = useModuleSettings();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<string | null>(null);

  const entries = NAV_ITEM_CATALOG[moduleKey] ?? [];

  function checked(navKey: string) {
    return navKey in overrides ? overrides[navKey] : isNavItemActive(navKey);
  }

  async function handleNavToggle(entry: NavCatalogEntry) {
    const current = checked(entry.navKey);
    const next = !current;
    setOverrides((prev) => ({ ...prev, [entry.navKey]: next }));
    setToggling(entry.navKey);

    const result = await toggleNavItem(entry.navKey, moduleKey, entry.nodeType, entry.label, next);
    setToggling(null);

    if (result.success) {
      toast.success(`${next ? "Shown" : "Hidden"} "${entry.label}" in sidebar`);
    } else {
      setOverrides((prev) => ({ ...prev, [entry.navKey]: current }));
      toast.error(result.error ?? "Failed to update navigation item.");
    }
  }

  return (
    <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Navigation items — {displayName}</DialogTitle>
        <DialogDescription>
          Hide or show individual sub-groups and links within this module&apos;s sidebar section.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-0.5">
        {entries.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No navigation items catalogued for this module.
          </p>
        )}
        {entries.map((entry) => {
          const isGroup = entry.nodeType === "group";
          const isChild = !!entry.parentGroupKey;
          const active = checked(entry.navKey);
          const isBusy = toggling === entry.navKey;

          return (
            <div
              key={entry.navKey}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-2 py-1.5",
                isGroup && "mt-2 first:mt-0",
                isChild && "ml-4 border-l border-border/40 pl-3",
              )}
            >
              <span
                className={cn(
                  "truncate text-sm",
                  isGroup ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {entry.label}
              </span>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleNavToggle(entry)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                  active ? "bg-orange-500" : "bg-input",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
                    active ? "translate-x-4" : "translate-x-1",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </DialogContent>
  );
}
