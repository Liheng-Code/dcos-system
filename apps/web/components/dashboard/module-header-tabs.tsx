"use client";

import { Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModuleSettings } from "@/contexts/module-settings-context";
import type { ModuleNavGroup, ModuleNavTabItem } from "@/lib/module-nav";

function isItemActive(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const [hrefPath, hrefQuery] = href.split("?");
  const hrefParams = new URLSearchParams(hrefQuery);
  return hrefQuery
    ? pathname === hrefPath &&
      Array.from(hrefParams.entries()).every(([key, value]) => searchParams.get(key) === value)
    : pathname === hrefPath || pathname.startsWith(hrefPath + "/");
}

function ModuleHeaderTab({ item, isActive, pathname, searchParams }: {
  item: ModuleNavTabItem;
  isActive: boolean;
  pathname: string;
  searchParams: URLSearchParams;
}) {
  const [open, setOpen] = useState(false);

  if (!item.children?.length) {
    return (
      <Link
        href={item.href}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/15"
            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {item.label}
      </Link>
    );
  }

  const activeChild = item.children.find(child => isItemActive(pathname, searchParams, child.href));
  const displayLabel = activeChild?.label ?? item.label;

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link
        href={item.href}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/15"
            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {displayLabel}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
      </Link>
      {open && (
        <div className="absolute left-0 top-full z-50 pt-1">
          <div className="w-56 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg">
            {item.children.map(child => {
              const childActive = isItemActive(pathname, searchParams, child.href);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    childActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {child.label}
                  {childActive && <Check className="ml-auto h-4 w-4" />}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleHeaderTabsInner({ activeGroup }: { activeGroup: ModuleNavGroup }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isNavItemActive } = useModuleSettings();

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 shadow-sm shrink-0">
      {activeGroup.items.map(item => {
        if (item.hidden || !isNavItemActive(item.href)) return null;
        return (
          <ModuleHeaderTab
            key={item.href}
            item={item}
            isActive={isItemActive(pathname, searchParams, item.href)}
            pathname={pathname}
            searchParams={searchParams}
          />
        );
      })}
    </div>
  );
}

// Renders a horizontal tab bar for the active module group. Pass the group
// resolved by the calling layout (e.g. getActiveProcurementGroup(pathname)).
export function ModuleHeaderTabs({ activeGroup }: { activeGroup: ModuleNavGroup | null }) {
  if (!activeGroup) return null;
  return (
    <Suspense fallback={null}>
      <ModuleHeaderTabsInner activeGroup={activeGroup} />
    </Suspense>
  );
}
