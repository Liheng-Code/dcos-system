"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { HardHat, ChevronDown, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { useTaskAlerts } from "@/components/dashboard/task-alerts-provider";
import { useProject } from "@/components/dashboard/project-context";
import { useModuleSettings } from "@/contexts/module-settings-context";
import { getActiveModuleGroup } from "@/lib/module-nav";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { countLeaveRequestsByEmployeeIdWithStatusSubmitted, countOvertimeApprovalsByApproverIdWithStatusPending, countOvertimeNotificationsByRecipientIdWithIsRead, countWbsTasksByDepartmentIdsWithCrossDeptStatusRequested, getProfileById, listDepartmentsByDepartmentHead, listLeaveRequestsByFilterWithStatusSubmittedPendingCancellation, listUserRolesByUserId } from "@/lib/dashboard/dashboard-queries";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();
  const { selectedProject } = useProject();
  const isPrecontract = selectedProject?.project_type === "tender";
  // Design & Build / Turnkey tenders carry the design, so the bid team needs the Design module.
  const isDesignTender = isPrecontract && ["design_build", "turnkey"].includes(selectedProject?.contract_type ?? "");
  const { isModuleActive, isModuleVisible, isModulePermitted, isNavItemActive } = useModuleSettings();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHr, setIsHr] = useState(false);
  // Open/closed state of each module's sidebar section, keyed by module key.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const { unreadCount } = useTaskAlerts();
  const [approvalCount, setApprovalCount] = useState(0);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [otApprovalCount, setOtApprovalCount] = useState(0);
  const [otNotifCount, setOtNotifCount] = useState(0);
  const [crossRequestCount, setCrossRequestCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      getProfileById(data.user.id, "role").then(({ data: profile }) => {
        if (profile) setIsAdmin(profile.role === "admin");
      });
      // 02-USR Phase 4 — Administration folder gate broadened from isAdmin-only to
      // (isAdmin || isHr), per 00-Master.md §6 / 06-UI-UX-Design.md §4: module ownership is
      // "HR / System Admin", and HR_Manager is treated as admin-equivalent authority
      // server-side (apps/web/lib/admin-users/actor-context.ts's HR_ROLE_CODES). Unions
      // profiles.role with user_roles.role_code, matching that same precedent, so a user who
      // only holds the RBAC role_code (no legacy profiles.role="admin") isn't hidden from it.
      const HR_ROLE_CODES = new Set(["HR_Manager", "admin"]);
      listUserRolesByUserId(data.user.id).then(({ data: roleRows }) => {
        const codes = (roleRows ?? []).map((r: { role_code: string }) => r.role_code);
        if (codes.some((c) => HR_ROLE_CODES.has(c))) setIsHr(true);
      });
      const uid = data.user.id;
      listLeaveRequestsByFilterWithStatusSubmittedPendingCancellation(`approver_1_id.eq."${uid}",approver_2_id.eq."${uid}"`)
        .then(({ data: rows }) => {
          if (!rows) return;
          const count = rows.filter((req: { status: string; approver_1_id: string; approver_1_status: string; approver_2_id: string; approver_2_status: string }) => {
            if (req.status === "pending_cancellation") return true;
            if (req.approver_1_id === uid) return req.approver_1_status === "pending";
            if (req.approver_2_id === uid) return req.approver_1_status === "approved" && req.approver_2_status === "pending";
            return false;
          }).length;
          setApprovalCount(count);
        });
      countLeaveRequestsByEmployeeIdWithStatusSubmitted(uid)
        .then(({ count }) => {
          if (count !== null) setMyPendingCount(count);
        });
      countOvertimeApprovalsByApproverIdWithStatusPending(uid)
        .then(({ count }) => {
          if (count !== null) setOtApprovalCount(count);
        });
      countOvertimeNotificationsByRecipientIdWithIsRead(uid)
        .then(({ count }) => {
          if (count !== null) setOtNotifCount(count);
        });
      listDepartmentsByDepartmentHead(uid)
        .then(({ data: depts }) => {
          const ids = (depts ?? []).map((d: { id: string }) => d.id);
          if (ids.length === 0) return;
          countWbsTasksByDepartmentIdsWithCrossDeptStatusRequested(ids)
            .then(({ count }) => {
              if (count !== null) setCrossRequestCount(count);
            });
        });
    });
  }, []);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Badge counts keyed by nav item href or nav group navKey.
  const badges: Record<string, number> = {
    "/dashboard/department": crossRequestCount,
    "group:hr:time_payroll": otApprovalCount + otNotifCount,
  };

  type Icon = LucideIcon;

  // ── Standard nav item ─────────────────────────────────────────────────────
  function NavItem({ href, label, icon, exact, badge, navKey, customActive }: {
    href: string; label: string; icon: Icon; exact?: boolean; badge?: number; navKey?: string; customActive?: boolean;
  }) {
    if (!isNavItemActive(navKey ?? href)) return null;
    const active = customActive !== undefined ? customActive : isActive(href, exact);
    return <NavItemBase href={href} label={label} icon={icon} badge={badge} active={active} />;
  }

  function NavItemBase({ href, label, icon: Icon, badge, active }: {
    href: string; label: string; icon: Icon; badge?: number; active: boolean;
  }) {
    const content = (
      <>
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
        {href === "/dashboard/tasks" && unreadCount > 0 && (
          <span className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-5 text-white",
            collapsed ? "absolute right-1 top-1" : "ml-auto",
          )}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {href === "/dashboard/hr/leave" && (approvalCount + myPendingCount) > 0 && (
          <span className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-5 text-white",
            collapsed ? "absolute right-1 top-1" : "ml-auto",
          )}>
            {approvalCount + myPendingCount > 9 ? "9+" : approvalCount + myPendingCount}
          </span>
        )}
        {badge !== undefined && badge > 0 && (
          <span className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-5 text-white",
            collapsed ? "absolute right-1 top-1" : "ml-auto",
          )}>
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </>
    );

    const cls = cn(
      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Link href={href} className={cls}>{content}</Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return <Link href={href} className={cls}>{content}</Link>;
  }

  // ── QS group button (animated) ────────────────────────────────────────────
  function QsGroupNavItem({ href, navKey, label, icon: Icon, active, tabCount, index }: {
    href: string; navKey: string; label: string; icon: Icon; active: boolean; tabCount: number; index: number;
  }) {
    if (!isNavItemActive(navKey)) return null;
    const content = (
      <>
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-all duration-200 group-hover:scale-y-125 group-hover:bg-primary/60"
          style={{ opacity: active ? 1 : 0 }} />
        <span className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all duration-200 group-hover:scale-110 group-hover:-translate-x-0.5",
          active ? "bg-primary/10 text-primary" : "bg-sidebar-accent/60 text-sidebar-foreground/60 group-hover:bg-primary/10 group-hover:text-primary",
        )}>
          <Icon className="h-4 w-4" />
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className={cn(
              "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums transition-colors",
              active ? "bg-primary/10 text-primary" : "bg-sidebar-accent/60 text-sidebar-foreground/40 group-hover:text-primary",
            )}>
              {tabCount}
            </span>
          </>
        )}
      </>
    );

    const cls = cn(
      "qs-group-shine group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Link href={href} className={cls} style={{ animationDelay: `${index * 40}ms` }}>{content}</Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <Link href={href} className={cn(cls, "animate-in fade-in slide-in-from-left-2 duration-300")} style={{ animationDelay: `${index * 40}ms` }}>
        {content}
      </Link>
    );
  }

  // ── Section header ────────────────────────────────────────────────────────
  function FolderHeader({ label, open, onToggle, icon: Icon, level, navKey }: { label: string; open: boolean; onToggle: () => void; icon?: LucideIcon; level?: 1 | 2; navKey?: string }) {
    if (navKey && !isNavItemActive(navKey)) return null;
    if (collapsed) return null;
    if (level === 1) {
      return (
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm font-bold text-white transition-colors hover:text-white"
        >
          <span className="flex-1 truncate text-left">{label}</span>
          <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform duration-200", !open && "-rotate-90")} />
        </button>
      );
    }
    if (level === 2) {
      return (
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-sidebar-foreground/55 transition-colors hover:text-sidebar-foreground/80"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-foreground/35" />
          <span className="flex-1 truncate text-left">{label}</span>
          <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform duration-200", !open && "-rotate-90")} />
        </button>
      );
    }
    if (Icon) {
      return (
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">{label}</span>
          <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform duration-200", !open && "-rotate-90")} />
        </button>
      );
    }
    return (
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
    );
  }

  return (
    <aside className={cn(
      "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
      collapsed ? "w-16" : "w-64",
    )}>
      {/* Logo → back to module hub */}
      <Link
        href="/modules"
        title={collapsed ? "Back to module hub" : "Back to module hub"}
        className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4 transition-colors hover:bg-sidebar-accent"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm ring-1 ring-primary/20">
          <HardHat className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && <span className="text-base font-semibold tracking-tight text-sidebar-foreground">DCOS</span>}
      </Link>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 overflow-y-auto p-3 flex-1">

        {MODULE_REGISTRY.map((manifest, moduleIndex) => {
          const allowed = manifest.sidebarGate === "admin_or_hr"
            ? (isAdmin || isHr) && isModuleActive(manifest.key)
            : isModulePermitted(manifest.key);
          if (!allowed || !isModuleVisible(manifest.key)) return null;
          if (manifest.visible && !manifest.visible({ isPrecontract, isDesignTender })) return null;

          const open = !!openSections[manifest.key];
          const activeGroupKey = manifest.navGroups
            ? getActiveModuleGroup(manifest.navGroups, pathname, { isPrecontract })?.key
            : undefined;

          const section = (
            <>
              <FolderHeader
                label={manifest.name}
                open={open}
                onToggle={() => setOpenSections((prev) => ({ ...prev, [manifest.key]: !prev[manifest.key] }))}
                level={1}
              />
              {(collapsed || open) && (
                <>
                  {manifest.navItems?.map((item) => {
                    if (isPrecontract && item.executionOnly) return null;
                    return (
                      <NavItem
                        key={item.href}
                        href={item.href}
                        label={isPrecontract && item.precontractLabel ? item.precontractLabel : item.label}
                        icon={item.icon}
                        exact={item.exact}
                        badge={badges[item.href]}
                      />
                    );
                  })}
                  {manifest.navGroups?.map((group, index) => {
                    const Icon = manifest.groupIcons?.[group.key];
                    if (!Icon) return null;
                    if (group.visible && !group.visible({ isPrecontract })) return null;
                    // A switched-off page is route-blocked, so when the group's own entry page
                    // is off, open its first enabled page; hide the group if it has none.
                    const groupHref = isNavItemActive(group.href)
                      ? group.href
                      : group.items.find((item) =>
                          !item.hidden &&
                          (!item.visible || item.visible({ isPrecontract })) &&
                          isNavItemActive(item.href),
                        )?.href;
                    if (!groupHref) return null;
                    if (manifest.groupStyle === "animated") {
                      return (
                        <QsGroupNavItem
                          key={group.key}
                          href={groupHref}
                          navKey={group.navKey}
                          label={group.label}
                          icon={Icon}
                          active={activeGroupKey === group.key}
                          tabCount={group.items.filter((item) => !item.hidden).length}
                          index={index}
                        />
                      );
                    }
                    return (
                      <NavItem
                        key={group.key}
                        href={groupHref}
                        label={group.label}
                        icon={Icon}
                        navKey={group.navKey}
                        customActive={activeGroupKey === group.key}
                        badge={badges[group.navKey]}
                      />
                    );
                  })}
                </>
              )}
            </>
          );

          // The first section's items sit directly in the nav column; later sections are spaced blocks.
          if (moduleIndex === 0) return <Fragment key={manifest.key}>{section}</Fragment>;
          return (
            <div key={manifest.key} className={cn(!collapsed && "mt-3")}>
              {section}
            </div>
          );
        })}

      </nav>
    </aside>
  );
}
