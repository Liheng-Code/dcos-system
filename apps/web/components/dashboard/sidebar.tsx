"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  HardHat,
  Cog,
  Users,
  FolderTree,
  FileText,
  FileSearch,
  Send,
  ListChecks,
  ChevronDown,
  Building2,
  Clock,
  TrendingUp,
  BarChart2,
  History,
  PenTool,
  Wind,
  GanttChartSquare,
  ShieldCheck,
  ShieldAlert,
  FileClock,
  Handshake,
  FileSignature,
  Layers,
  Truck,
  Ruler,
  UserCheck,
  Network,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { useTaskAlerts } from "@/components/dashboard/task-alerts-provider";
import { useProject } from "@/components/dashboard/project-context";
import { useModuleSettings } from "@/contexts/module-settings-context";
import { PROCUREMENT_GROUPS, getActiveProcurementGroup } from "@/lib/procurement-nav";
import { INVENTORY_GROUPS, getActiveInventoryGroup } from "@/lib/inventory-nav";
import { QS_GROUPS, getActiveQsGroup } from "@/lib/qs-nav";
import { DESIGN_GROUPS, getActiveDesignGroup } from "@/lib/design-nav";
import { ACCOUNT_GROUPS, getActiveAccountGroup } from "@/lib/account-nav";
import { REPORTING_GROUPS, getActiveReportingGroup } from "@/lib/reporting-nav";
import { PLANNING_GROUPS, getActivePlanningGroup } from "@/lib/planning-nav";
import { CONSTRUCTION_GROUPS, getActiveConstructionGroup } from "@/lib/construction-nav";
import { DOCUMENT_CONTROL_GROUPS, getActiveDocumentControlGroup } from "@/lib/document-control-nav";
import { HR_GROUPS, getActiveHrGroup } from "@/lib/hr-nav";



const PROJECT_ITEMS = [
  { href: "/dashboard",                          label: "Dashboard",    icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects",                 label: "Projects",     icon: HardHat },
  { href: "/dashboard/wbs",                      label: "WBS",          icon: FolderTree },
  { href: "/dashboard/my-tasks",                 label: "My Tasks",     icon: UserCheck },
  { href: "/dashboard/tasks",                    label: "Tasks",        icon: ListChecks },
  { href: "/dashboard/department",               label: "Department",   icon: Network },
  { href: "/dashboard/stakeholders",             label: "Stakeholders", icon: Users },

] as const;

const PRECONTRACT_ITEMS = [
  { href: "/dashboard",                          label: "Dashboard",    icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects",                 label: "Projects",     icon: HardHat },
  { href: "/dashboard/wbs",                      label: "WBS (Preliminary)", icon: FolderTree },
  { href: "/dashboard/stakeholders",             label: "Stakeholders", icon: Users },

] as const;

const PROCUREMENT_GROUP_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  suppliers: Building2,
  sourcing_receiving: FileText,
};

const INVENTORY_GROUP_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  stock_operations: Truck,
};

const QS_GROUP_ICONS: Record<string, LucideIcon> = {
  tendering: FileSearch,
  libraries: Layers,
  cost_control: BarChart2,
  subcontractor: Handshake,
  contract_admin: FileSignature,
  qto: Ruler,
};

const DESIGN_GROUP_ICONS: Record<string, LucideIcon> = {
  correspondence: Send,
  architecture: Building2,
  structure: PenTool,
  mep: Wind,
};

const ACCOUNT_GROUP_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  reports: BarChart2,
};

const REPORTING_GROUP_ICONS: Record<string, LucideIcon> = {
  reports: BarChart2,
  insights_automation: TrendingUp,
};

const PLANNING_GROUP_ICONS: Record<string, LucideIcon> = {
  schedule: GanttChartSquare,
  resources_reports: Users,
};

const CONSTRUCTION_GROUP_ICONS: Record<string, LucideIcon> = {
  site_quality: HardHat,
  hse: ShieldCheck,
};

const DOCUMENT_CONTROL_GROUP_ICONS: Record<string, LucideIcon> = {
  documents: FileText,
  controller: History,
};

const HR_GROUP_ICONS: Record<string, LucideIcon> = {
  workforce: Users,
  time_payroll: Clock,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();
  const { selectedProject } = useProject();
  const isPrecontract = selectedProject?.project_type === "tender";
  const { isModuleActive, isModulePermitted, isNavItemActive } = useModuleSettings();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHr, setIsHr] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [reportingOpen, setReportingOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [procurementOpen, setProcurementOpen] = useState(false);

  // Inventory (top-level module)
  const [invModuleOpen, setInvModuleOpen] = useState(false);
  const [hrOpen, setHrOpen] = useState(false);
  const [qsGroupOpen, setQsGroupOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
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
      supabase.from("profiles").select("role").eq("id", data.user.id).single().then(({ data: profile }) => {
        if (profile) setIsAdmin(profile.role === "admin");
      });
      // 02-USR Phase 4 — Administration folder gate broadened from isAdmin-only to
      // (isAdmin || isHr), per 00-Master.md §6 / 06-UI-UX-Design.md §4: module ownership is
      // "HR / System Admin", and HR_Manager is treated as admin-equivalent authority
      // server-side (apps/web/lib/admin-users/actor-context.ts's HR_ROLE_CODES). Unions
      // profiles.role with user_roles.role_code, matching that same precedent, so a user who
      // only holds the RBAC role_code (no legacy profiles.role="admin") isn't hidden from it.
      const HR_ROLE_CODES = new Set(["HR_Manager", "admin"]);
      supabase.from("user_roles").select("role_code").eq("user_id", data.user.id).then(({ data: roleRows }) => {
        const codes = (roleRows ?? []).map((r: { role_code: string }) => r.role_code);
        if (codes.some((c) => HR_ROLE_CODES.has(c))) setIsHr(true);
      });
      const uid = data.user.id;
      supabase
        .from("leave_requests")
        .select("approver_1_id, approver_1_status, approver_2_id, approver_2_status, status")
        .or(`approver_1_id.eq."${uid}",approver_2_id.eq."${uid}"`)
        .in("status", ["submitted", "pending_cancellation"])
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
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", uid)
        .eq("status", "submitted")
        .then(({ count }) => {
          if (count !== null) setMyPendingCount(count);
        });
      supabase
        .from("overtime_approvals")
        .select("id", { count: "exact", head: true })
        .eq("approver_id", uid)
        .eq("status", "pending")
        .then(({ count }) => {
          if (count !== null) setOtApprovalCount(count);
        });
      supabase
        .from("overtime_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", uid)
        .eq("is_read", false)
        .then(({ count }) => {
          if (count !== null) setOtNotifCount(count);
        });
      supabase
        .from("departments")
        .select("id")
        .eq("department_head", uid)
        .then(({ data: depts }) => {
          const ids = (depts ?? []).map((d: { id: string }) => d.id);
          if (ids.length === 0) return;
          supabase
            .from("wbs_tasks")
            .select("id", { count: "exact", head: true })
            .in("department_id", ids)
            .eq("cross_dept_status", "requested")
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

  const activeProcurementKey = getActiveProcurementGroup(pathname)?.key;
  const activeInventoryKey = getActiveInventoryGroup(pathname)?.key;
  const activeQsKey = getActiveQsGroup(pathname, isPrecontract)?.key;
  const activeDesignKey = getActiveDesignGroup(pathname)?.key;
  const activeAccountKey = getActiveAccountGroup(pathname)?.key;
  const activeReportingKey = getActiveReportingGroup(pathname)?.key;
  const activePlanningKey = getActivePlanningGroup(pathname)?.key;
  const activeConstructionKey = getActiveConstructionGroup(pathname)?.key;
  const activeDocumentControlKey = getActiveDocumentControlGroup(pathname)?.key;
  const activeHrKey = getActiveHrGroup(pathname)?.key;

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
          className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm font-bold text-black transition-colors hover:text-black"
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

        {/* ── PROJECT ── */}
        {isModulePermitted("project") && (
        <>
        <FolderHeader label="Project" open={projectOpen} onToggle={() => setProjectOpen(!projectOpen)} level={1} />
        {(collapsed || projectOpen) && (isPrecontract ? PRECONTRACT_ITEMS : PROJECT_ITEMS).map((item) => (
          <NavItem
            key={item.href}
            {...item}
            badge={item.href === "/dashboard/department" ? crossRequestCount : undefined}
          />
        ))}
        </>
        )}

        {/* ── REPORTING ── */}
        {isModulePermitted("reporting") && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Reporting" open={reportingOpen} onToggle={() => setReportingOpen(!reportingOpen)} level={1} />
          {(collapsed || reportingOpen) && (
            <>
              {REPORTING_GROUPS.map(group => {
                const Icon = REPORTING_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activeReportingKey === group.key}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── DOCUMENT CONTROL ── */}
        {isModulePermitted("document_control") && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Document Control" open={docOpen} onToggle={() => setDocOpen(!docOpen)} level={1} />
          {(collapsed || docOpen) && (
            <>
              {DOCUMENT_CONTROL_GROUPS.map(group => {
                const Icon = DOCUMENT_CONTROL_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activeDocumentControlKey === group.key}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── PLANNING ── */}
        {isModulePermitted("planning") && !isPrecontract && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Planning" open={planningOpen} onToggle={() => setPlanningOpen(!planningOpen)} level={1} />
          {(collapsed || planningOpen) && (
            <>
              {PLANNING_GROUPS.map(group => {
                const Icon = PLANNING_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activePlanningKey === group.key}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── DESIGN ── */}
        {isModulePermitted("design") && !isPrecontract && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Design" open={designOpen} onToggle={() => setDesignOpen(!designOpen)} level={1} />
          {(collapsed || designOpen) && (
            <>
              {DESIGN_GROUPS.map(group => {
                const Icon = DESIGN_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activeDesignKey === group.key}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── PROCUREMENT ── */}
        {isModulePermitted("procurement") && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Procurement" open={procurementOpen} onToggle={() => setProcurementOpen(!procurementOpen)} level={1} />
          {(collapsed || procurementOpen) && (
            <>
              {PROCUREMENT_GROUPS.map(group => {
                const Icon = PROCUREMENT_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activeProcurementKey === group.key}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── INVENTORY ── */}
        {isModulePermitted("inventory") && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Inventory" open={invModuleOpen} onToggle={() => setInvModuleOpen(!invModuleOpen)} level={1} />
          {(collapsed || invModuleOpen) && (
            <>
              {INVENTORY_GROUPS.map(group => {
                const Icon = INVENTORY_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activeInventoryKey === group.key}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── QUANTITY SURVEYING ── */}
        {isModulePermitted("qs") && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Quantity Surveying" open={qsGroupOpen} onToggle={() => setQsGroupOpen(!qsGroupOpen)} level={1} />
          {(collapsed || qsGroupOpen) && (
            <>
              {QS_GROUPS.map((group, index) => {
                const Icon = QS_GROUP_ICONS[group.key];
                if (!Icon) return null;
                if (group.visible && !group.visible({ isPrecontract })) return null;
                return (
                  <QsGroupNavItem
                    key={group.key}
                    href={group.href}
                    navKey={group.navKey}
                    label={group.label}
                    icon={Icon}
                    active={activeQsKey === group.key}
                    tabCount={group.items.length}
                    index={index}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── CONSTRUCTION ── */}
        {isModulePermitted("construction") && !isPrecontract && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Construction" open={siteOpen} onToggle={() => setSiteOpen(!siteOpen)} level={1} />
          {(collapsed || siteOpen) && (
            <>
              {CONSTRUCTION_GROUPS.map(group => {
                const Icon = CONSTRUCTION_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activeConstructionKey === group.key}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── HR MANAGEMENT ── */}
        {isModulePermitted("hr") && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="HR Management" open={hrOpen} onToggle={() => setHrOpen(!hrOpen)} level={1} />
          {(collapsed || hrOpen) && (
            <>
              {HR_GROUPS.map(group => {
                const Icon = HR_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activeHrKey === group.key}
                    badge={group.key === "time_payroll" ? otApprovalCount + otNotifCount : undefined}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── ACCOUNT / FINANCE ── */}
        {isModulePermitted("account") && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Account" open={accountOpen} onToggle={() => setAccountOpen(!accountOpen)} level={1} />
          {(collapsed || accountOpen) && (
            <>
              {ACCOUNT_GROUPS.map(group => {
                const Icon = ACCOUNT_GROUP_ICONS[group.key];
                if (!Icon) return null;
                return (
                  <NavItem
                    key={group.key}
                    href={group.href}
                    label={group.label}
                    icon={Icon}
                    navKey={group.navKey}
                    customActive={activeAccountKey === group.key}
                  />
                );
              })}
            </>
          )}
        </div>
        )}

        {/* ── ADMINISTRATION ── */}
        {(isAdmin || isHr) && isModuleActive("administration") && (
          <div className={cn(!collapsed && "mt-3")}>
            <FolderHeader label="Administration" open={adminOpen} onToggle={() => setAdminOpen(!adminOpen)} level={1} />
            {(collapsed || adminOpen) && (
              <>
                <NavItem href="/dashboard/settings"                                  label="Settings"               icon={Cog} />
                <NavItem href="/dashboard/administration/users"                      label="User Management"        icon={Users} />
                <NavItem href="/dashboard/administration/roles-permissions"          label="Roles & Permissions"    icon={ShieldCheck} />
                <NavItem href="/dashboard/administration/departments"                label="Departments"            icon={Building2} />
                <NavItem href="/dashboard/administration/security"                   label="Security"               icon={ShieldAlert} />
                <NavItem href="/dashboard/administration/audit-logs"                 label="Audit Logs"             icon={FileClock} />
                <NavItem href="/dashboard/administration/stakeholder-templates"      label="Stakeholder Templates"   icon={FileText} />
              </>
            )}
          </div>
        )}

      </nav>
    </aside>
  );
}
