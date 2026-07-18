"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  HardHat,
  Cog,
  Users,
  FolderTree,
  FileText,
  FileWarning,
  FileSearch,
  Send,
  ListChecks,
  ChevronDown,
  Briefcase,
  Building2,
  Clock,
  Landmark,
  LogOut,
  CheckSquare,
  Award,
  TrendingUp,
  UserCheck,
  Package,
  Receipt,
  BarChart2,
  CalendarRange,
  ClipboardCheck,
  AlertTriangle,
  DollarSign,
  GitBranch,
  Shield,
  Bell,
  History,
  RefreshCw,
  PenTool,
  Wind,
  Grid,
  HelpCircle,
  Calculator,
  Cpu,
  Wrench,
  Camera,
  CalendarDays,
  GitCompare,
  GanttChartSquare,
  ShieldCheck,
  MessageSquare,
  ClipboardList,
  Eye,
  Handshake,
  ScrollText,
  FileSignature,
  BookTemplate,
  Box,
  Database,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { useTaskAlerts } from "@/components/dashboard/task-alerts-provider";
import { useProject } from "@/components/dashboard/project-context";



const PROJECT_ITEMS = [
  { href: "/dashboard",                          label: "Dashboard",    icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects",                 label: "Projects",     icon: HardHat },
  { href: "/dashboard/wbs",                      label: "WBS",          icon: FolderTree },
  { href: "/dashboard/tasks",                    label: "Tasks",        icon: ListChecks },

] as const;

const PRECONTRACT_ITEMS = [
  { href: "/dashboard",                          label: "Dashboard",    icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects",                 label: "Projects",     icon: HardHat },
  { href: "/dashboard/wbs",                      label: "WBS (Preliminary)", icon: FolderTree },

] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();
  const { selectedProject } = useProject();
  const isPrecontract = selectedProject?.project_type === "tender";
  const [isAdmin, setIsAdmin] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [reportingOpen, setReportingOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [arcOpen, setArcOpen] = useState(false);
  const [strOpen, setStrOpen] = useState(false);
  const [mepOpen, setMepOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [procurementOpen, setProcurementOpen] = useState(false);
  const [hrOpen, setHrOpen] = useState(false);
  const [qsGroupOpen, setQsGroupOpen] = useState(false);
  const [tenderingOpen, setTenderingOpen] = useState(false);
  const [qsCostControlOpen, setQsCostControlOpen] = useState(false);
  const [subcontractorOpen, setSubcontractorOpen] = useState(false);
  const [contractAdminOpen, setContractAdminOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [hseOpen, setHseOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const { unreadCount } = useTaskAlerts();
  const [approvalCount, setApprovalCount] = useState(0);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [otApprovalCount, setOtApprovalCount] = useState(0);
  const [otNotifCount, setOtNotifCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("profiles").select("role").eq("id", data.user.id).single().then(({ data: profile }) => {
        if (profile) setIsAdmin(profile.role === "admin");
      });
      const uid = data.user.id;
      supabase
        .from("leave_requests")
        .select("approver_1_id, approver_1_status, approver_2_id, approver_2_status, status")
        .or(`approver_1_id.eq."${uid}",approver_2_id.eq."${uid}"`)
        .in("status", ["submitted", "pending_cancellation"])
        .then(({ data: rows }) => {
          if (!rows) return;
          const count = rows.filter((req: any) => {
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
    });
  }, []);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  type Icon = LucideIcon;

  // ── Standard nav item ─────────────────────────────────────────────────────
  function NavItem({ href, label, icon, exact, badge }: {
    href: string; label: string; icon: Icon; exact?: boolean; badge?: number;
  }) {
    const active = isActive(href, exact);
    return <NavItemBase href={href} label={label} icon={icon} badge={badge} active={active} />;
  }

  // ── Nav item that highlights based on a "?tab=" query string ───────────────
  // useSearchParams must sit under its own Suspense boundary, so this is kept
  // separate from the plain-path NavItem above to avoid suspending the whole
  // sidebar during prerendering.
  function TabNavItem({ href, label, icon, badge }: {
    href: string; label: string; icon: Icon; badge?: number;
  }) {
    return (
      <Suspense fallback={<NavItemBase href={href} label={label} icon={icon} badge={badge} active={false} />}>
        <TabNavItemInner href={href} label={label} icon={icon} badge={badge} />
      </Suspense>
    );
  }

  function TabNavItemInner({ href, label, icon, badge }: {
    href: string; label: string; icon: Icon; badge?: number;
  }) {
    const searchParams = useSearchParams();
    const [hrefPath, hrefQuery] = href.split("?");
    const hrefParams = new URLSearchParams(hrefQuery);
    const active = pathname === hrefPath &&
      Array.from(hrefParams.entries()).every(([key, value]) => searchParams.get(key) === value);
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

  // ── Section header ────────────────────────────────────────────────────────
  function FolderHeader({ label, open, onToggle, icon: Icon, level }: { label: string; open: boolean; onToggle: () => void; icon?: LucideIcon; level?: 1 | 2 }) {
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
      "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
      collapsed ? "w-16" : "w-64",
    )}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm ring-1 ring-primary/20">
          <HardHat className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && <span className="text-base font-semibold tracking-tight text-sidebar-foreground">DC/OS</span>}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 overflow-y-auto p-3 flex-1">

        {/* ── PROJECT ── */}
        <FolderHeader label="Project" open={projectOpen} onToggle={() => setProjectOpen(!projectOpen)} level={1} />
        {(collapsed || projectOpen) && (isPrecontract ? PRECONTRACT_ITEMS : PROJECT_ITEMS).map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        {/* ── PRE-CONTRACT (shown only for tender-type projects) ── */}
        {isPrecontract && (
          <div className={cn(!collapsed && "mt-3")}>
            <FolderHeader label="Pre-Contract" open={tenderingOpen} onToggle={() => setTenderingOpen(!tenderingOpen)} level={1} />
            {(collapsed || tenderingOpen) && (
              <>
                <NavItem href="/dashboard/tenders/register"          label="Tender Register"   icon={FileSearch} />
                <NavItem href="/dashboard/tenders/cost-estimation"   label="Cost Estimation"   icon={Calculator} />
                <NavItem href="/dashboard/tenders/budget-codes"      label="Budget Codes"      icon={FolderTree} />
                <NavItem href="/dashboard/tenders/cost-library"      label="Prelim Cost Library"      icon={Database} />
                <NavItem href="/dashboard/tenders/tender-management" label="Tender Management" icon={ClipboardList} />
                <NavItem href="/dashboard/tenders/submissions"       label="Submissions"       icon={Send} />
                <NavItem href="/dashboard/tenders/bid-evaluation"    label="Bid Evaluation"    icon={Award} />
              </>
            )}
          </div>
        )}

        {/* ── REPORTING ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Reporting" open={reportingOpen} onToggle={() => setReportingOpen(!reportingOpen)} level={1} />
          {(collapsed || reportingOpen) && (
            <>
              <NavItem href="/dashboard/reports"         label="Reports Hub"      icon={BarChart2} />
              <NavItem href="/dashboard/reports/schedule" label="Scheduled Reports" icon={Clock} />
              <NavItem href="/dashboard/account/reports"  label="Financial Reports" icon={FileText} />
              <NavItem href="/dashboard/planning/reports" label="Schedule Reports"  icon={History} />
              <NavItem href="/dashboard/insights"        label="Insights"          icon={BarChart2} />
            </>
          )}
        </div>

        {/* ── DOCUMENT CONTROL ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Document Control" open={docOpen} onToggle={() => setDocOpen(!docOpen)} level={1} />
          {(collapsed || docOpen) && (
            <>
              <NavItem href="/dashboard/documents"              label="Documents"             icon={FileText} />
              <NavItem href="/dashboard/documents/transmittals" label="Transmittals"          icon={Send} />
              <NavItem href="/dashboard/documents/controller"   label="Controller Dashboard"  icon={LayoutDashboard} />
              <NavItem href="/dashboard/documents/audit-log"    label="Audit Log"             icon={History} />
            </>
          )}
        </div>

        {/* ── PLANNING ── */}
        {!isPrecontract && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Planning" open={planningOpen} onToggle={() => setPlanningOpen(!planningOpen)} level={1} />
          {(collapsed || planningOpen) && (
            <>
              <NavItem href="/dashboard/planning"             label="Dashboard"       icon={LayoutDashboard} />
              <NavItem href="/dashboard/planning/gantt"       label="Gantt Chart"     icon={GanttChartSquare} />
              <NavItem href="/dashboard/wbs/lookahead"        label="Look-ahead"      icon={CalendarRange} />
              <NavItem href="/dashboard/planning/calendars"   label="Calendars"       icon={CalendarDays} />
              <NavItem href="/dashboard/planning/comparison"  label="Comparison"      icon={GitCompare} />
              <NavItem href="/dashboard/planning/resource-loading" label="Resources"  icon={Users} />
              <NavItem href="/dashboard/planning/reports"     label="Reports"         icon={BarChart2} />
            </>
          )}
        </div>
        )}

        {/* ── DESIGN ── */}
        {!isPrecontract && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Design" open={designOpen} onToggle={() => setDesignOpen(!designOpen)} level={1} />
          {(collapsed || designOpen) && (
            <div className={cn(!collapsed && "ml-2 border-l border-border/50 pl-1")}>

              {/* Cross-discipline */}
              <NavItem href="/dashboard/design"              label="Dashboard"      icon={LayoutDashboard} />
              <NavItem href="/dashboard/design/coordination" label="Coordination"   icon={GitBranch} />
              <NavItem href="/dashboard/design/markup"       label="Drawing Markup" icon={PenTool} />
              <NavItem href="/dashboard/design/bim"          label="BIM Viewer"     icon={Box} />

              {/* Architecture */}
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="Architecture" open={arcOpen} onToggle={() => setArcOpen(!arcOpen)} />
                {(collapsed || arcOpen) && (
                  <>
                    <NavItem href="/dashboard/design/arc/drawings"       label="ARC Drawings"       icon={FileText} />
                    <NavItem href="/dashboard/design/arc/room-data"      label="Room Data"          icon={Grid} />
                    <NavItem href="/dashboard/design/arc/rfi"            label="ARC RFI"            icon={HelpCircle} />
                    <NavItem href="/dashboard/design/arc/door-schedule"  label="Door Schedule"      icon={Grid} />
                    <NavItem href="/dashboard/design/arc/window-schedule" label="Window Schedule"   icon={Grid} />
                    <NavItem href="/dashboard/design/arc/finish-schedule" label="Finish Schedule"   icon={Grid} />
                    <NavItem href="/dashboard/design/arc/material-approval" label="Material Approval" icon={Shield} />
                  </>
                )}
              </div>

              {/* Structure */}
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="Structure" open={strOpen} onToggle={() => setStrOpen(!strOpen)} />
                {(collapsed || strOpen) && (
                  <>
                    <NavItem href="/dashboard/design/str/drawings"     label="STR Drawings"      icon={FileText} />
                    <NavItem href="/dashboard/design/str/calculations" label="Calculations"      icon={Calculator} />
                    <NavItem href="/dashboard/design/str/models"       label="BIM Models"        icon={GitBranch} />
                    <NavItem href="/dashboard/design/str/rebar"        label="Rebar Scheduling"  icon={Wrench} />
                    <NavItem href="/dashboard/design/str/rfi"          label="STR RFI"           icon={HelpCircle} />
                    <NavItem href="/dashboard/design/str/technical-queries" label="Tech. Queries" icon={MessageSquare} />
                    <NavItem href="/dashboard/design/str/design-changes" label="Design Changes"  icon={GitCompare} />
                  </>
                )}
              </div>

              {/* MEP */}
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="MEP" open={mepOpen} onToggle={() => setMepOpen(!mepOpen)} />
                {(collapsed || mepOpen) && (
                  <>
                    <NavItem href="/dashboard/design/mep/drawings"     label="MEP Drawings"    icon={FileText} />
                    <NavItem href="/dashboard/design/mep/equipment"   label="Equipment"       icon={Cpu} />
                    <NavItem href="/dashboard/design/mep/load-schedule" label="Load Schedule"  icon={BarChart2} />
                    <NavItem href="/dashboard/design/mep/sleeves"     label="Sleeve Details"  icon={Wrench} />
                    <NavItem href="/dashboard/design/mep/submittals"  label="Submittals"      icon={Send} />
                    <NavItem href="/dashboard/design/mep/rfi"         label="MEP RFI"         icon={HelpCircle} />
                    <NavItem href="/dashboard/design/mep/commissioning" label="Commissioning" icon={ShieldCheck} />
                  </>
                )}
              </div>

            </div>
          )}
        </div>
        )}

        {/* ── PROCUREMENT ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Procurement" open={procurementOpen} onToggle={() => setProcurementOpen(!procurementOpen)} level={1} />
          {(collapsed || procurementOpen) && (
            <>
              <NavItem href="/dashboard/procurement"             label="Dashboard"             icon={LayoutDashboard} />
              <NavItem href="/dashboard/procurement/analytics"   label="Analytics"             icon={BarChart2} />
              <NavItem href="/dashboard/procurement/boq"         label="BOQ"                   icon={DollarSign} />
              <NavItem href="/dashboard/procurement/supplier-portal" label="Supplier Portal"   icon={UserCheck} />
              <NavItem href="/dashboard/procurement/suppliers"            label="Suppliers"             icon={Building2} />
              <NavItem href="/dashboard/procurement/prequalification"    label="Supplier PQ"          icon={ClipboardCheck} />
              <NavItem href="/dashboard/procurement/supplier-performance" label="Supplier Perf."       icon={TrendingUp} />
              <NavItem href="/dashboard/procurement/rfq"         label="RFQs"                   icon={FileSearch} />
              <NavItem href="/dashboard/procurement/pr"          label="Purchase Requisitions" icon={FileText} />
              <NavItem href="/dashboard/procurement/po"          label="Purchase Orders"       icon={Package} />
              <NavItem href="/dashboard/procurement/inventory"   label="Inventory"             icon={ListChecks} />
              <NavItem href="/dashboard/procurement/auto-reorder" label="Auto Reorder"         icon={RefreshCw} />
              <NavItem href="/dashboard/procurement/goods-receipt" label="Goods Receipt"        icon={CheckSquare} />
              <NavItem href="/dashboard/procurement/invoice-matches" label="Invoice Matching"     icon={Receipt} />
              <NavItem href="/dashboard/procurement/notifications"  label="Notifications"        icon={Bell} />
              <NavItem href="/dashboard/procurement/audit-log"      label="Audit Log"            icon={History} />
            </>
          )}
        </div>

        {/* ── QUANTITY SURVEYING ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Quantity Surveying" open={qsGroupOpen} onToggle={() => setQsGroupOpen(!qsGroupOpen)} level={1} />
          {(collapsed || qsGroupOpen) && (
            <div className={cn(!collapsed && "ml-2 border-l border-border/50 pl-1")}>

              {/* Tendering & Estimating (shared — visible for all project types) */}
              {!isPrecontract && (
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="Tender & Estimate" open={tenderingOpen} onToggle={() => setTenderingOpen(!tenderingOpen)} level={2} />
                {(collapsed || tenderingOpen) && (
                  <div className={cn(!collapsed && "ml-2 border-l border-border/40 pl-2")}>
                    <NavItem href="/dashboard/tenders/register"          label="Tender Register"       icon={FileSearch} />
                    <NavItem href="/dashboard/tenders/cost-estimation"   label="Cost Estimation"       icon={Calculator} />
                    <NavItem href="/dashboard/tenders/budget-codes"      label="Budget Codes"          icon={FolderTree} />
                    <NavItem href="/dashboard/tenders/cost-library"      label="Prelim Cost Library"          icon={Database} />
                    <NavItem href="/dashboard/tenders/tender-management" label="Tender Management"     icon={ClipboardList} />
                    <NavItem href="/dashboard/tenders/submissions"       label="Submissions"           icon={Send} />
                    <NavItem href="/dashboard/tenders/bid-evaluation"    label="Bid Evaluation"        icon={Award} />
                  </div>
                )}
              </div>
              )}

              {/* Cost Control */}
              {!isPrecontract && (
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="Cost Control" open={qsCostControlOpen} onToggle={() => setQsCostControlOpen(!qsCostControlOpen)} level={2} />
                {(collapsed || qsCostControlOpen) && (
                  <div className={cn(!collapsed && "ml-2 border-l border-border/40 pl-2")}>
                    <NavItem href="/dashboard/qs/boq"                    label="BOQ"                  icon={DollarSign} />
                    <TabNavItem href="/dashboard/qs?tab=cost-control"        label="Cost Control"          icon={BarChart2} />
                    <TabNavItem href="/dashboard/qs?tab=contingency"        label="Contingency"           icon={Shield} />
                    <NavItem href="/dashboard/qs/evm"                    label="Earned Value"          icon={TrendingUp} />
                    <TabNavItem href="/dashboard/qs?tab=portfolio"          label="Portfolio"             icon={Briefcase} />
                    <TabNavItem href="/dashboard/qs?tab=audit"              label="Audit Log"             icon={History} />
                    <TabNavItem href="/dashboard/qs?tab=currency"           label="Currency"              icon={DollarSign} />
                    <NavItem href="/dashboard/qs/cost-library"           label="Cost Library"          icon={BookTemplate} />
                    <NavItem href="/dashboard/qs/rate-libraries"        label="Rate Libraries"        icon={BookTemplate} />
                    <NavItem href="/dashboard/qs/claims"                 label="Progress Claims"       icon={FileText} />
                    <NavItem href="/dashboard/qs/variations"             label="Variations"            icon={GitBranch} />
                  </div>
                )}
              </div>
              )}

              {/* Subcontractor Management */}
              {!isPrecontract && (
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="Subcon Mgmt" open={subcontractorOpen} onToggle={() => setSubcontractorOpen(!subcontractorOpen)} level={2} />
                {(collapsed || subcontractorOpen) && (
                  <div className={cn(!collapsed && "ml-2 border-l border-border/40 pl-2")}>
                    <NavItem href="/dashboard/subcontractors/back-charges"        label="Back Charges"        icon={AlertTriangle} />
                    <NavItem href="/dashboard/subcontractors/performance-notices" label="Performance Notices" icon={FileWarning} />
                  </div>
                )}
              </div>
              )}

              {/* Contract Administration */}
              {!isPrecontract && (
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="Contract Admin" open={contractAdminOpen} onToggle={() => setContractAdminOpen(!contractAdminOpen)} level={2} />
                {(collapsed || contractAdminOpen) && (
                  <div className={cn(!collapsed && "ml-2 border-l border-border/40 pl-2")}>
                    <NavItem href="/dashboard/contracts/register"        label="Contract Register"     icon={FileSignature} />
                    <NavItem href="/dashboard/contracts/notices"         label="Notices"               icon={AlertTriangle} />
                    <NavItem href="/dashboard/contracts/employer-instructions" label="Employer Instructions" icon={ScrollText} />
                    <NavItem href="/dashboard/contracts/correspondence"  label="Correspondence"        icon={MessageSquare} />
                    <NavItem href="/dashboard/contracts/entitlements"    label="Entitlements"          icon={Shield} />
                  </div>
                )}
              </div>
              )}

            </div>
          )}
        </div>

        {/* ── CONSTRUCTION ── */}
        {!isPrecontract && (
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Construction" open={siteOpen} onToggle={() => setSiteOpen(!siteOpen)} level={1} />
          {(collapsed || siteOpen) && (
            <div className={cn(!collapsed && "ml-2 border-l border-border/50 pl-1")}>

              {/* Site items */}
              <NavItem href="/dashboard/site"                 label="Dashboard"         icon={LayoutDashboard} />
              <NavItem href="/dashboard/site/daily-reports"   label="Daily Reports"     icon={FileText} />
              <NavItem href="/dashboard/site/manpower"        label="Manpower"          icon={Users} />
              <NavItem href="/dashboard/site/equipment"       label="Equipment"         icon={Wrench} />
              <NavItem href="/dashboard/site/progress-photos" label="Progress Photos"   icon={Camera} />
              <NavItem href="/dashboard/qaqc"                 label="Inspections & ITP" icon={ClipboardCheck} />
              <NavItem href="/dashboard/qaqc/ncrs"            label="NCR Management"    icon={AlertTriangle} />

              {/* HSE sub-section */}
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="HSE" open={hseOpen} onToggle={() => setHseOpen(!hseOpen)} />
                {(collapsed || hseOpen) && (
                  <>
                    <NavItem href="/dashboard/hse"                  label="Dashboard"        icon={LayoutDashboard} />
                    <NavItem href="/dashboard/hse/permits"          label="Work Permits"      icon={FileText} />
                    <NavItem href="/dashboard/hse/toolbox-talks"    label="Toolbox Talks"    icon={MessageSquare} />
                    <NavItem href="/dashboard/hse/incidents"        label="Incidents"        icon={AlertTriangle} />
                    <NavItem href="/dashboard/hse/risk-assessments" label="Risk Assessments" icon={ClipboardList} />
                    <NavItem href="/dashboard/hse/observations"     label="Observations"     icon={Eye} />
                  </>
                )}
              </div>

            </div>
          )}
        </div>
        )}



        {/* ── HR MANAGEMENT ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="HR Management" open={hrOpen} onToggle={() => setHrOpen(!hrOpen)} level={1} />
          {(collapsed || hrOpen) && (
            <>
              <NavItem href="/dashboard/hr/dashboard"    label="Workforce Dashboard"   icon={LayoutDashboard} />
              <NavItem href="/dashboard/hr/organization" label="Organization Setup"    icon={Building2} />
              <NavItem href="/dashboard/hr/employees"    label="Employee Master"       icon={Users} />
              <NavItem href="/dashboard/hr/resources"    label="Resource Allocation"   icon={Briefcase} />
              <NavItem href="/dashboard/hr/attendance"   label="Attendance"            icon={Clock} />

              {/* Leave Management */}
              <NavItem href="/dashboard/hr/leave" label="E-Leave" icon={LogOut} />

              {/* Payroll */}
              <NavItem href="/dashboard/hr/payroll" label="Payroll" icon={DollarSign} />

              <NavItem href="/dashboard/hr/timesheet"   label="Timesheet"             icon={CheckSquare} />
              <NavItem href="/dashboard/hr/overtime"   label="OT Management"         icon={Clock} badge={otApprovalCount + otNotifCount} />
              <NavItem href="/dashboard/hr/training"    label="Training & Competency"  icon={Award} />
              <NavItem href="/dashboard/hr/performance" label="Performance"            icon={TrendingUp} />
              <NavItem href="/dashboard/hr/recruitment" label="Recruitment"            icon={UserCheck} />
              <NavItem href="/dashboard/hr/assets"      label="Employee Assets"        icon={Package} />
            </>
          )}
        </div>

        {/* ── ACCOUNT / FINANCE ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Account" open={accountOpen} onToggle={() => setAccountOpen(!accountOpen)} level={1} />
          {(collapsed || accountOpen) && (
            <>
              <NavItem href="/dashboard/account"          label="Overview"          icon={LayoutDashboard} />
              <NavItem href="/dashboard/account/coa"      label="Chart of Accounts" icon={Landmark} />
              <NavItem href="/dashboard/account/ap"       label="AP Invoices"       icon={FileText} />
              <NavItem href="/dashboard/account/ar"       label="AR Invoices"       icon={Receipt} />
              <NavItem href="/dashboard/account/payments"  label="Payments"          icon={DollarSign} />
              <NavItem href="/dashboard/account/journals"  label="Journal Entries"   icon={GitBranch} />
              <NavItem href="/dashboard/account/gl"        label="General Ledger"    icon={BarChart2} />
              <NavItem href="/dashboard/account/bank"      label="Bank Accounts"     icon={Building2} />
              <NavItem href="/dashboard/account/payment-runs" label="Payment Runs"   icon={CheckSquare} />
              <NavItem href="/dashboard/account/wht"       label="Withholding Tax"   icon={AlertTriangle} />
              <NavItem href="/dashboard/account/reports"   label="Reports"           icon={BarChart2} />
              <NavItem href="/dashboard/account/currencies" label="Multi-Currency"    icon={DollarSign} />
            </>
          )}
        </div>

        {/* ── ADMINISTRATION ── */}
        {isAdmin && (
          <div className={cn(!collapsed && "mt-3")}>
            <FolderHeader label="Administration" open={adminOpen} onToggle={() => setAdminOpen(!adminOpen)} level={1} />
            {(collapsed || adminOpen) && (
              <>
                <NavItem href="/dashboard/settings"                                  label="Settings"               icon={Cog} />
                <NavItem href="/dashboard/administration/stakeholders"               label="Stakeholders"            icon={Users} />
                <NavItem href="/dashboard/administration/stakeholder-templates"      label="Stakeholder Templates"   icon={FileText} />
              </>
            )}
          </div>
        )}

      </nav>
    </aside>
  );
}
