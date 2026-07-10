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
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { useTaskAlerts } from "@/components/dashboard/task-alerts-provider";

// ── Module accent colors (hue in oklch) ──────────────────────────────────
const SECTION_HUES: Record<string, number> = {
  project: 221,
  reporting: 271,
  doc: 190,
  planning: 160,
  design: 38,
  procurement: 173,
  qs: 239,
  construction: 30,
  hr: 350,
  account: 55,
  admin: 215,
};

const PROJECT_ITEMS = [
  { href: "/dashboard",                          label: "Dashboard",    icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects",                 label: "Projects",     icon: HardHat },
  { href: "/dashboard/wbs",                      label: "WBS",          icon: FolderTree },
  { href: "/dashboard/tasks",                    label: "Tasks",        icon: ListChecks },

] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();
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
  function NavItem({ href, label, icon: Icon, exact, badge, section }: {
    href: string; label: string; icon: Icon; exact?: boolean; badge?: number; section?: string;
  }) {
    const active = isActive(href, exact);
    const hue = section ? SECTION_HUES[section] : undefined;
    const sectionBg = hue ? `oklch(0.95 0.04 ${hue})` : undefined;
    const sectionBorder = hue ? `oklch(0.55 0.15 ${hue})` : undefined;

    const content = (
      <>
        <Icon className="h-5 w-5 shrink-0" style={active && section ? { color: sectionBorder } : undefined} />
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

    const activeBg = sectionBg || "rgb(239 246 255)";
    const activeBorder = sectionBorder || "oklch(0.38 0.12 265)";
    const cls = cn(
      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "text-foreground font-semibold shadow-sm"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );
    const activeStyle = active ? {
      backgroundColor: activeBg,
      borderLeft: `3px solid ${activeBorder}`,
      marginLeft: "-3px",
    } : undefined;

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Link href={href} className={cls} style={activeStyle}>{content}</Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return <Link href={href} className={cls} style={activeStyle}>{content}</Link>;
  }

  // ── Section header ────────────────────────────────────────────────────────
  function FolderHeader({ label, open, onToggle, section }: { label: string; open: boolean; onToggle: () => void; section?: string }) {
    if (collapsed) return null;
    const hue = section ? SECTION_HUES[section] : undefined;
    const headerBorder = hue ? `oklch(0.55 0.15 ${hue})` : undefined;
    const headerBg = hue ? `oklch(0.97 0.04 ${hue})` : undefined;
    return (
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-foreground"
        style={{
          borderLeft: headerBorder ? `3px solid ${headerBorder}` : undefined,
          paddingLeft: "12px",
          backgroundColor: headerBg,
          color: hue ? `oklch(0.35 0.12 ${hue})` : undefined,
        }}
      >
        {label}
        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
    );
  }

  return (
    <aside className={cn(
      "flex flex-col border-r border-border bg-gradient-to-b from-sidebar to-sidebar/95 transition-all duration-300",
      collapsed ? "w-16" : "w-64",
    )}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border/80 px-4 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm ring-1 ring-primary/20">
          <HardHat className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && <span className="text-base font-semibold tracking-tight">DC/OS</span>}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 overflow-y-auto p-3 flex-1">

        {/* ── PROJECT ── */}
        <FolderHeader label="Project" open={projectOpen} onToggle={() => setProjectOpen(!projectOpen)} section="project" />
        {(collapsed || projectOpen) && PROJECT_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} section="project" />
        ))}

        {/* ── REPORTING ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Reporting" open={reportingOpen} onToggle={() => setReportingOpen(!reportingOpen)} section="reporting" />
          {(collapsed || reportingOpen) && (
            <>
              <NavItem href="/dashboard/reports"         label="Reports Hub"      icon={BarChart2} section="reporting" />
              <NavItem href="/dashboard/reports/schedule" label="Scheduled Reports" icon={Clock} section="reporting" />
              <NavItem href="/dashboard/account/reports"  label="Financial Reports" icon={FileText} section="reporting" />
              <NavItem href="/dashboard/planning/reports" label="Schedule Reports"  icon={History} section="reporting" />
              <NavItem href="/dashboard/insights"        label="Insights"          icon={BarChart2} section="reporting" />
            </>
          )}
        </div>

        {/* ── DOCUMENT CONTROL ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Document Control" open={docOpen} onToggle={() => setDocOpen(!docOpen)} section="doc" />
          {(collapsed || docOpen) && (
            <>
              <NavItem href="/dashboard/documents"              label="Documents"             icon={FileText} section="doc" />
              <NavItem href="/dashboard/documents/transmittals" label="Transmittals"          icon={Send} section="doc" />
              <NavItem href="/dashboard/documents/controller"   label="Controller Dashboard"  icon={LayoutDashboard} section="doc" />
              <NavItem href="/dashboard/documents/audit-log"    label="Audit Log"             icon={History} section="doc" />
            </>
          )}
        </div>

        {/* ── PLANNING ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Planning" open={planningOpen} onToggle={() => setPlanningOpen(!planningOpen)} section="planning" />
          {(collapsed || planningOpen) && (
            <>
              <NavItem href="/dashboard/planning"             label="Dashboard"       icon={LayoutDashboard} section="planning" />
              <NavItem href="/dashboard/planning/gantt"       label="Gantt Chart"     icon={GanttChartSquare} section="planning" />
              <NavItem href="/dashboard/wbs/lookahead"        label="Look-ahead"      icon={CalendarRange} section="planning" />
              <NavItem href="/dashboard/planning/calendars"   label="Calendars"       icon={CalendarDays} section="planning" />
              <NavItem href="/dashboard/planning/comparison"  label="Comparison"      icon={GitCompare} section="planning" />
              <NavItem href="/dashboard/planning/resource-loading" label="Resources"  icon={Users} section="planning" />
              <NavItem href="/dashboard/planning/reports"     label="Reports"         icon={BarChart2} section="planning" />
            </>
          )}
        </div>

        {/* ── DESIGN ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Design" open={designOpen} onToggle={() => setDesignOpen(!designOpen)} section="design" />
          {(collapsed || designOpen) && (
            <div className={cn(!collapsed && "ml-2 border-l border-border/50 pl-1")}>

              {/* Cross-discipline */}
              <NavItem href="/dashboard/design"              label="Dashboard"      icon={LayoutDashboard} section="design" />
              <NavItem href="/dashboard/design/coordination" label="Coordination"   icon={GitBranch} section="design" />
              <NavItem href="/dashboard/design/markup"       label="Drawing Markup" icon={PenTool} section="design" />

              {/* Architecture */}
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="Architecture" open={arcOpen} onToggle={() => setArcOpen(!arcOpen)} section="design" />
                {(collapsed || arcOpen) && (
                  <>
                    <NavItem href="/dashboard/design/arc/drawings"       label="ARC Drawings"       icon={FileText} section="design" />
                    <NavItem href="/dashboard/design/arc/room-data"      label="Room Data"          icon={Grid} section="design" />
                    <NavItem href="/dashboard/design/arc/rfi"            label="ARC RFI"            icon={HelpCircle} section="design" />
                    <NavItem href="/dashboard/design/arc/door-schedule"  label="Door Schedule"      icon={Grid} section="design" />
                    <NavItem href="/dashboard/design/arc/window-schedule" label="Window Schedule"   icon={Grid} section="design" />
                    <NavItem href="/dashboard/design/arc/finish-schedule" label="Finish Schedule"   icon={Grid} section="design" />
                    <NavItem href="/dashboard/design/arc/material-approval" label="Material Approval" icon={Shield} section="design" />
                  </>
                )}
              </div>

              {/* Structure */}
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="Structure" open={strOpen} onToggle={() => setStrOpen(!strOpen)} section="design" />
                {(collapsed || strOpen) && (
                  <>
                    <NavItem href="/dashboard/design/str/drawings"     label="STR Drawings"      icon={FileText} section="design" />
                    <NavItem href="/dashboard/design/str/calculations" label="Calculations"      icon={Calculator} section="design" />
                    <NavItem href="/dashboard/design/str/models"       label="BIM Models"        icon={GitBranch} section="design" />
                    <NavItem href="/dashboard/design/str/rebar"        label="Rebar Scheduling"  icon={Wrench} section="design" />
                    <NavItem href="/dashboard/design/str/rfi"          label="STR RFI"           icon={HelpCircle} section="design" />
                    <NavItem href="/dashboard/design/str/technical-queries" label="Tech. Queries" icon={MessageSquare} section="design" />
                    <NavItem href="/dashboard/design/str/design-changes" label="Design Changes"  icon={GitCompare} section="design" />
                  </>
                )}
              </div>

              {/* MEP */}
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="MEP" open={mepOpen} onToggle={() => setMepOpen(!mepOpen)} section="design" />
                {(collapsed || mepOpen) && (
                  <>
                    <NavItem href="/dashboard/design/mep/drawings"     label="MEP Drawings"    icon={FileText} section="design" />
                    <NavItem href="/dashboard/design/mep/equipment"   label="Equipment"       icon={Cpu} section="design" />
                    <NavItem href="/dashboard/design/mep/load-schedule" label="Load Schedule"  icon={BarChart2} section="design" />
                    <NavItem href="/dashboard/design/mep/sleeves"     label="Sleeve Details"  icon={Wrench} section="design" />
                    <NavItem href="/dashboard/design/mep/submittals"  label="Submittals"      icon={Send} section="design" />
                    <NavItem href="/dashboard/design/mep/rfi"         label="MEP RFI"         icon={HelpCircle} section="design" />
                    <NavItem href="/dashboard/design/mep/commissioning" label="Commissioning" icon={ShieldCheck} section="design" />
                  </>
                )}
              </div>

            </div>
          )}
        </div>

        {/* ── PROCUREMENT ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Procurement" open={procurementOpen} onToggle={() => setProcurementOpen(!procurementOpen)} section="procurement" />
          {(collapsed || procurementOpen) && (
            <>
              <NavItem href="/dashboard/procurement"             label="Dashboard"             icon={LayoutDashboard} section="procurement" />
              <NavItem href="/dashboard/procurement/analytics"   label="Analytics"             icon={BarChart2} section="procurement" />
              <NavItem href="/dashboard/procurement/boq"         label="BOQ"                   icon={DollarSign} section="procurement" />
              <NavItem href="/dashboard/procurement/supplier-portal" label="Supplier Portal"   icon={UserCheck} section="procurement" />
              <NavItem href="/dashboard/procurement/suppliers"            label="Suppliers"             icon={Building2} section="procurement" />
              <NavItem href="/dashboard/procurement/prequalification"    label="Supplier PQ"          icon={ClipboardCheck} section="procurement" />
              <NavItem href="/dashboard/procurement/supplier-performance" label="Supplier Perf."       icon={TrendingUp} section="procurement" />
              <NavItem href="/dashboard/procurement/rfq"         label="RFQs"                   icon={FileSearch} section="procurement" />
              <NavItem href="/dashboard/procurement/pr"          label="Purchase Requisitions" icon={FileText} section="procurement" />
              <NavItem href="/dashboard/procurement/po"          label="Purchase Orders"       icon={Package} section="procurement" />
              <NavItem href="/dashboard/procurement/inventory"   label="Inventory"             icon={ListChecks} section="procurement" />
              <NavItem href="/dashboard/procurement/auto-reorder" label="Auto Reorder"         icon={RefreshCw} section="procurement" />
              <NavItem href="/dashboard/procurement/goods-receipt" label="Goods Receipt"        icon={CheckSquare} section="procurement" />
              <NavItem href="/dashboard/procurement/invoice-matches" label="Invoice Matching"     icon={Receipt} section="procurement" />
              <NavItem href="/dashboard/procurement/notifications"  label="Notifications"        icon={Bell} section="procurement" />
              <NavItem href="/dashboard/procurement/audit-log"      label="Audit Log"            icon={History} section="procurement" />
            </>
          )}
        </div>

        {/* ── QUANTITY SURVEYING ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Quantity Surveying" open={qsGroupOpen} onToggle={() => setQsGroupOpen(!qsGroupOpen)} section="qs" />
          {(collapsed || qsGroupOpen) && (
            <>
              <NavItem href="/dashboard/qs/boq"                    label="BOQ"                  icon={DollarSign} section="qs" />
              <NavItem href="/dashboard/qs?tab=cost-control"        label="Cost Control"          icon={BarChart2} section="qs" />
              <NavItem href="/dashboard/qs?tab=contingency"        label="Contingency"           icon={Shield} section="qs" />
              <NavItem href="/dashboard/qs/evm"                    label="Earned Value"          icon={TrendingUp} section="qs" />
              <NavItem href="/dashboard/qs?tab=portfolio"          label="Portfolio"             icon={Briefcase} section="qs" />
              <NavItem href="/dashboard/qs?tab=audit"              label="Audit Log"             icon={History} section="qs" />
              <NavItem href="/dashboard/qs?tab=currency"           label="Currency"              icon={DollarSign} section="qs" />
              <NavItem href="/dashboard/qs/cost-library"           label="Cost Library"          icon={BookTemplate} section="qs" />
              <NavItem href="/dashboard/qs/claims"                 label="Progress Claims"       icon={FileText} section="qs" />
              <NavItem href="/dashboard/qs/variations"             label="Variations"            icon={GitBranch} section="qs" />
              <NavItem href="/dashboard/subcontractors/back-charges"        label="Back Charges"        icon={AlertTriangle} section="qs" />
              <NavItem href="/dashboard/subcontractors/performance-notices" label="Performance Notices" icon={FileWarning} section="qs" />
              <NavItem href="/dashboard/tenders/register"          label="Tender Register"       icon={FileSearch} section="qs" />
              <NavItem href="/dashboard/tenders/cost-estimation"   label="Cost Estimation"       icon={Calculator} section="qs" />
              <NavItem href="/dashboard/tenders/tender-management" label="Tender Management"     icon={ClipboardList} section="qs" />
              <NavItem href="/dashboard/tenders/submissions"       label="Submissions"           icon={Send} section="qs" />
              <NavItem href="/dashboard/tenders/bid-evaluation"    label="Bid Evaluation"        icon={Award} section="qs" />
              <NavItem href="/dashboard/contracts/register"        label="Contract Register"     icon={FileSignature} section="qs" />
              <NavItem href="/dashboard/contracts/notices"         label="Notices"               icon={AlertTriangle} section="qs" />
              <NavItem href="/dashboard/contracts/employer-instructions" label="Employer Instructions" icon={ScrollText} section="qs" />
              <NavItem href="/dashboard/contracts/correspondence"  label="Correspondence"        icon={MessageSquare} section="qs" />
              <NavItem href="/dashboard/contracts/entitlements"    label="Entitlements"          icon={Shield} section="qs" />
            </>
          )}
        </div>

        {/* ── CONSTRUCTION ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Construction" open={siteOpen} onToggle={() => setSiteOpen(!siteOpen)} section="construction" />
          {(collapsed || siteOpen) && (
            <div className={cn(!collapsed && "ml-2 border-l border-border/50 pl-1")}>

              {/* Site items */}
              <NavItem href="/dashboard/site"                 label="Dashboard"         icon={LayoutDashboard} section="construction" />
              <NavItem href="/dashboard/site/daily-reports"   label="Daily Reports"     icon={FileText} section="construction" />
              <NavItem href="/dashboard/site/manpower"        label="Manpower"          icon={Users} section="construction" />
              <NavItem href="/dashboard/site/equipment"       label="Equipment"         icon={Wrench} section="construction" />
              <NavItem href="/dashboard/site/progress-photos" label="Progress Photos"   icon={Camera} section="construction" />
              <NavItem href="/dashboard/qaqc"                 label="Inspections & ITP" icon={ClipboardCheck} section="construction" />
              <NavItem href="/dashboard/qaqc/ncrs"            label="NCR Management"    icon={AlertTriangle} section="construction" />

              {/* HSE sub-section */}
              <div className={cn(!collapsed && "mt-1")}>
                <FolderHeader label="HSE" open={hseOpen} onToggle={() => setHseOpen(!hseOpen)} section="construction" />
                {(collapsed || hseOpen) && (
                  <>
                    <NavItem href="/dashboard/hse"                  label="Dashboard"        icon={LayoutDashboard} section="construction" />
                    <NavItem href="/dashboard/hse/permits"          label="Work Permits"      icon={FileText} section="construction" />
                    <NavItem href="/dashboard/hse/toolbox-talks"    label="Toolbox Talks"    icon={MessageSquare} section="construction" />
                    <NavItem href="/dashboard/hse/incidents"        label="Incidents"        icon={AlertTriangle} section="construction" />
                    <NavItem href="/dashboard/hse/risk-assessments" label="Risk Assessments" icon={ClipboardList} section="construction" />
                    <NavItem href="/dashboard/hse/observations"     label="Observations"     icon={Eye} section="construction" />
                  </>
                )}
              </div>

            </div>
          )}
        </div>



        {/* ── HR MANAGEMENT ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="HR Management" open={hrOpen} onToggle={() => setHrOpen(!hrOpen)} section="hr" />
          {(collapsed || hrOpen) && (
            <>
              <NavItem href="/dashboard/hr/dashboard"    label="Workforce Dashboard"   icon={LayoutDashboard} section="hr" />
              <NavItem href="/dashboard/hr/organization" label="Organization Setup"    icon={Building2} section="hr" />
              <NavItem href="/dashboard/hr/employees"    label="Employee Master"       icon={Users} section="hr" />
              <NavItem href="/dashboard/hr/resources"    label="Resource Allocation"   icon={Briefcase} section="hr" />
              <NavItem href="/dashboard/hr/attendance"   label="Attendance"            icon={Clock} section="hr" />

              {/* Leave Management */}
              <NavItem href="/dashboard/hr/leave" label="E-Leave" icon={LogOut} section="hr" />

              {/* Payroll */}
              <NavItem href="/dashboard/hr/payroll" label="Payroll" icon={DollarSign} section="hr" />

              <NavItem href="/dashboard/hr/timesheet"   label="Timesheet"             icon={CheckSquare} section="hr" />
              <NavItem href="/dashboard/hr/overtime"   label="OT Management"         icon={Clock} badge={otApprovalCount + otNotifCount} section="hr" />
              <NavItem href="/dashboard/hr/training"    label="Training & Competency"  icon={Award} section="hr" />
              <NavItem href="/dashboard/hr/performance" label="Performance"            icon={TrendingUp} section="hr" />
              <NavItem href="/dashboard/hr/recruitment" label="Recruitment"            icon={UserCheck} section="hr" />
              <NavItem href="/dashboard/hr/assets"      label="Employee Assets"        icon={Package} section="hr" />
            </>
          )}
        </div>

        {/* ── ACCOUNT / FINANCE ── */}
        <div className={cn(!collapsed && "mt-3")}>
          <FolderHeader label="Account" open={accountOpen} onToggle={() => setAccountOpen(!accountOpen)} section="account" />
          {(collapsed || accountOpen) && (
            <>
              <NavItem href="/dashboard/account"          label="Overview"          icon={LayoutDashboard} section="account" />
              <NavItem href="/dashboard/account/coa"      label="Chart of Accounts" icon={Landmark} section="account" />
              <NavItem href="/dashboard/account/ap"       label="AP Invoices"       icon={FileText} section="account" />
              <NavItem href="/dashboard/account/ar"       label="AR Invoices"       icon={Receipt} section="account" />
              <NavItem href="/dashboard/account/payments"  label="Payments"          icon={DollarSign} section="account" />
              <NavItem href="/dashboard/account/journals"  label="Journal Entries"   icon={GitBranch} section="account" />
              <NavItem href="/dashboard/account/gl"        label="General Ledger"    icon={BarChart2} section="account" />
              <NavItem href="/dashboard/account/bank"      label="Bank Accounts"     icon={Building2} section="account" />
              <NavItem href="/dashboard/account/payment-runs" label="Payment Runs"   icon={CheckSquare} section="account" />
              <NavItem href="/dashboard/account/wht"       label="Withholding Tax"   icon={AlertTriangle} section="account" />
              <NavItem href="/dashboard/account/reports"   label="Reports"           icon={BarChart2} section="account" />
              <NavItem href="/dashboard/account/currencies" label="Multi-Currency"    icon={DollarSign} section="account" />
            </>
          )}
        </div>

        {/* ── ADMINISTRATION ── */}
        {isAdmin && (
          <div className={cn(!collapsed && "mt-3")}>
            <FolderHeader label="Administration" open={adminOpen} onToggle={() => setAdminOpen(!adminOpen)} section="admin" />
            {(collapsed || adminOpen) && (
              <>
                <NavItem href="/dashboard/settings"                                  label="Settings"               icon={Cog} section="admin" />
                <NavItem href="/dashboard/administration/stakeholders"               label="Stakeholders"            icon={Users} section="admin" />
                <NavItem href="/dashboard/administration/stakeholder-templates"      label="Stakeholder Templates"   icon={FileText} section="admin" />
              </>
            )}
          </div>
        )}

      </nav>
    </aside>
  );
}
