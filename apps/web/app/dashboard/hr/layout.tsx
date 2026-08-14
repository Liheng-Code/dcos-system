"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { checkHrPermissions, type HrPermissions } from "@/lib/hr/permissions";
import { cn } from "@/lib/utils";
import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveHrGroup } from "@/lib/hr-nav";
import {
  LogOut,
  CheckSquare,
  FileText,
  Award,
  LayoutDashboard,
  Settings,
  ArrowLeft,
  Bell,
  CalendarDays,
  Globe,
  Users,
  Users2,
  RefreshCw,
  GitBranch,
  BarChart2,
  DollarSign,
  ScrollText,
  Calculator,
  Receipt,
  Shield,
  ListChecks,
  PieChart,
  ClipboardList,
  Clock,
} from "lucide-react";

// ── Payroll sub-nav (shown only when inside /hr/payroll) ─────────────────────
const PAYROLL_ALL_GROUPS = [
  {
    label: null,
    items: [
      { href: "/dashboard/hr/payroll/my-payslip", label: "My Payslip",  icon: ScrollText, description: "View and download your monthly payslips" },
    ],
  },
];

const PAYROLL_ADMIN_GROUPS = [
  {
    label: "HR ADMIN",
    items: [
      { href: "/dashboard/hr/payroll",          label: "Payroll Dashboard", icon: LayoutDashboard, description: "Manage salary runs, payslips and reports" },
      { href: "/dashboard/hr/payroll/runs",     label: "Payroll Runs",      icon: ListChecks,      description: "View and manage all monthly payroll runs" },
      { href: "/dashboard/hr/payroll/setup",    label: "Salary Setup",      icon: DollarSign,      description: "Configure base salary and allowances per employee" },
      { href: "/dashboard/hr/payroll/periods",  label: "Payroll Periods",   icon: CalendarDays,    description: "Manage monthly payroll periods and their status" },
      { href: "/dashboard/hr/payroll/run",      label: "Run Payroll",       icon: Calculator,      description: "Calculate salary for a payroll period" },
      { href: "/dashboard/hr/payroll/reports",  label: "Payroll Reports",   icon: BarChart2,       description: "Summary and export for each payroll period" },
    ],
  },
  {
    label: "CONTROL",
    items: [
      { href: "/dashboard/hr/payroll/cost-allocation", label: "Cost Allocation", icon: PieChart,       description: "Allocate payroll cost to projects and WBS" },
      { href: "/dashboard/hr/payroll/audit",           label: "Audit Log",        icon: ClipboardList,  description: "Full payroll workflow audit trail" },
    ],
  },
  {
    label: "CONFIGURATION",
    items: [
      { href: "/dashboard/hr/payroll/tax-config",  label: "Tax Config (TOS)", icon: Receipt, description: "Cambodia Tax on Salary brackets and relief" },
      { href: "/dashboard/hr/payroll/nssf-config", label: "NSSF Config",      icon: Shield,  description: "NSSF contribution rules and rates" },
    ],
  },
];

// ── OT sub-nav (shown only when inside /hr/overtime) ──────────────────────────
const OT_GROUPS = [
  {
    label: null,
    items: [
      { href: "/dashboard/hr/overtime",             label: "OT Dashboard",      icon: LayoutDashboard },
      { href: "/dashboard/hr/overtime/apply",        label: "Apply for OT",     icon: Clock },
      { href: "/dashboard/hr/overtime/my-requests",  label: "My Requests",      icon: FileText },
      { href: "/dashboard/hr/overtime/notifications",label: "Notifications",    icon: Bell },
      { href: "/dashboard/hr/overtime/approval-chain",label: "My Approval Chain", icon: GitBranch },
    ],
  },
  {
    label: "APPROVAL",
    items: [
      { href: "/dashboard/hr/overtime/approvals",   label: "Approvals",        icon: CheckSquare },
    ],
  },
  {
    label: "ADMIN CONFIG",
    items: [
      { href: "/dashboard/hr/overtime/analytics",    label: "Analytics",       icon: BarChart2 },
      { href: "/dashboard/hr/overtime/audit",         label: "Audit Log",      icon: ClipboardList },
      { href: "/dashboard/hr/overtime/approval-chains",label: "All Chains",    icon: GitBranch },
      { href: "/dashboard/hr/overtime/rates",        label: "OT Rates",        icon: DollarSign },
      { href: "/dashboard/hr/overtime/limits",       label: "OT Limits",       icon: Shield },
      { href: "/dashboard/hr/overtime/level-config", label: "Level Eligibility", icon: Users2 },
    ],
  },
];

// ── Leave sub-nav (shown only when inside /hr/leave) ─────────────────────────

const LEAVE_GROUPS = [
  {
    label: null,
    items: [
      { href: "/dashboard/hr/leave",               label: "Leave Dashboard",    icon: LayoutDashboard },
      { href: "/dashboard/hr/leave/apply",          label: "Apply for Leave",   icon: LogOut },
      { href: "/dashboard/hr/leave/my-requests",    label: "My Requests",       icon: FileText },
      { href: "/dashboard/hr/leave/team-calendar",  label: "Team Calendar",     icon: CalendarDays },
      { href: "/dashboard/hr/leave/public-holidays",label: "Public Holidays",   icon: Globe },
      { href: "/dashboard/hr/leave/who-is-on-leave",label: "Who's on Leave",    icon: Users2 },
      { href: "/dashboard/hr/leave/replacement",    label: "Replacement Leave", icon: RefreshCw },
      { href: "/dashboard/hr/leave/notifications",  label: "Notifications",     icon: Bell },
      { href: "/dashboard/hr/leave/approval-chain", label: "My Approval Chain", icon: GitBranch },
    ],
  },
  {
    label: "SUPERVISOR",
    items: [
      { href: "/dashboard/hr/leave/approvals", label: "Approvals", icon: CheckSquare },
    ],
  },
  {
    label: "ADMIN",
    items: [
      { href: "/dashboard/hr/leave/admin",          label: "Leave Types",       icon: Settings },
      { href: "/dashboard/hr/leave/approval-chains",label: "Approval Chains",   icon: GitBranch },
      { href: "/dashboard/hr/leave/admin",          label: "Team Capacity",     icon: Users },
      { href: "/dashboard/hr/leave/seniority-rules",label: "Seniority Rules",   icon: Award },
      { href: "/dashboard/hr/leave/probation-policy",label: "Probation Policy", icon: Shield },
      { href: "/dashboard/hr/leave/reports",        label: "Leave Reports",     icon: BarChart2 },
      { href: "/dashboard/administration/year-end", label: "Year-end Run",      icon: RefreshCw },
    ],
  },
];

interface ApprovalNavRow {
  approver_1_id: string | null;
  approver_1_status: string | null;
  approver_2_id: string | null;
  approver_2_status: string | null;
  status: string;
}

export default function HRLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inLeave = pathname.startsWith("/dashboard/hr/leave");
  const inPayroll = pathname.startsWith("/dashboard/hr/payroll");
  const inOvertime = pathname.startsWith("/dashboard/hr/overtime");
  const [perms, setPerms] = useState<HrPermissions | null>(null);
  const [approvalCount, setApprovalCount] = useState(0);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [otNotifCount, setOtNotifCount] = useState(0);
  const [otApprovalCount, setOtApprovalCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const uid = data.user.id;
        checkHrPermissions(supabase, uid).then(setPerms);
        supabase
          .from("leave_requests")
          .select("approver_1_id, approver_1_status, approver_2_id, approver_2_status, status")
          .or(`approver_1_id.eq."${uid}",approver_2_id.eq."${uid}"`)
          .in("status", ["submitted", "pending_cancellation"])
          .then(({ data: rows }) => {
            if (!rows) return;
            const count = (rows as ApprovalNavRow[]).filter((req) => {
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
          .from("overtime_notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", uid)
          .eq("is_read", false)
          .then(({ count }) => {
            if (count !== null) setOtNotifCount(count);
          });
        supabase
          .from("overtime_approvals")
          .select("id", { count: "exact", head: true })
          .eq("approver_id", uid)
          .eq("status", "pending")
          .then(({ count }) => {
            if (count !== null) setOtApprovalCount(count);
          });
      }
    });
  }, []);

  // Outside leave/payroll/overtime sections, the main sidebar's HR Management folder
  // provides navigation — just the shared header tab bar, no second sidebar needed.
  if (!inLeave && !inPayroll && !inOvertime) {
    return (
      <ModulePageLayout headerTabs={<ModuleHeaderTabs activeGroup={getActiveHrGroup(pathname)} />}>
        {children}
      </ModulePageLayout>
    );
  }

  // ── Payroll sub-nav ──────────────────────────────────────────────────────
  if (inPayroll) {
    const isHrAdmin = perms?.canAdmin || perms?.isApprover;
    const payrollGroups = [
      ...PAYROLL_ALL_GROUPS,
      ...(isHrAdmin ? PAYROLL_ADMIN_GROUPS : []),
    ];

    // Find active page metadata for the panel header
    const allPayrollItems = payrollGroups.flatMap((g) => g.items);
    const activeItem = allPayrollItems.find((item) => pathname === item.href);

    return (
      <div className="flex items-start gap-4 p-0">
        <aside className="w-52 flex-shrink-0">
          <div className="sticky top-0">
            {/* Nav card — starts flush with the right panel */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              {/* Back link + current page title */}
              <div className="mb-1 flex items-center gap-2">
                <Link href="/dashboard/hr/dashboard" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <span className="text-xs text-muted-foreground font-medium">Payroll</span>
              </div>
              {activeItem && (
                <p className="text-sm font-semibold text-foreground mb-4 leading-snug">{activeItem.label}</p>
              )}
              {!activeItem && <div className="mb-4" />}
              <nav className="flex flex-col gap-0.5">
              {payrollGroups.map((group, gi) => (
                <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                  {group.label && (
                    <p className="px-3 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {group.label}
                    </p>
                  )}
                  {group.items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
              </nav>
            </div>{/* end nav card */}
          </div>{/* end sticky */}
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    );
  }

  // ── OT sub-nav ────────────────────────────────────────────────────────────
  if (inOvertime) {
    const visibleOtGroups = OT_GROUPS
      .map((group) => {
        if (group.label === "APPROVAL" && !perms?.isApprover) return null;
        if (group.label === "ADMIN CONFIG" && !perms?.canAdmin) return null;
        return group;
      })
      .filter(Boolean) as typeof OT_GROUPS;
    const allOtItems = visibleOtGroups.flatMap((g) => g.items);
    const activeItem = allOtItems.find((item) => pathname === item.href);

    return (
      <div className="flex items-start gap-4 p-0">
        <aside className="w-52 flex-shrink-0">
          <div className="sticky top-0">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Link href="/dashboard/hr/dashboard" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <span className="text-xs text-muted-foreground font-medium">OT Management</span>
              </div>
              {activeItem && (
                <p className="text-sm font-semibold text-foreground mb-4 leading-snug">{activeItem.label}</p>
              )}
              {!activeItem && <div className="mb-4" />}
              <nav className="flex flex-col gap-0.5">
                {visibleOtGroups.map((group, gi) => (
                  <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                    {group.label && (
                      <p className="px-3 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        {group.label}
                      </p>
                    )}
                    {group.items.map((item) => {
                      const isActive = pathname === item.href;
                      const Icon = item.icon;
                      const count = item.label === "Notifications" ? otNotifCount : item.label === "Approvals" ? otApprovalCount : 0;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {count > 0 && (
                            <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white leading-none">
                              {count}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    );
  }

  const visibleGroups = LEAVE_GROUPS
    .map((group) => {
      // ADMIN group: only if user canAdmin
      if (group.label === "ADMIN" && !perms?.canAdmin) {
        return null;
      }
      // SUPERVISOR group (Approvals): only if user isApprover
      if (group.label === "SUPERVISOR" && !perms?.isApprover) {
        return null;
      }
      return group;
    })
    .filter(Boolean) as typeof LEAVE_GROUPS;
  return (
    <div className="flex items-start gap-4 p-0">
      {/* Leave sub-nav sidebar */}
      <aside className="w-52 flex-shrink-0">
        <div className="sticky mt-[74px] top-[calc(1.5rem+74px)] rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Link
              href="/dashboard/hr/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="text-sm font-semibold text-foreground">E-Leave</h2>
          </div>

          <nav className="flex flex-col gap-0.5">
            {visibleGroups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                {group.label && (
                  <p className="px-3 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {group.label}
                  </p>
                )}
                {group.items.map((section) => {
                  const isActive = pathname === section.href;
                  const Icon = section.icon;
                  return (
                    <Link
                      key={`${section.href}-${section.label}`}
                      href={section.href}
                      className={cn(
                        "flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{section.label}</span>
                      {section.label === "Approvals" && approvalCount > 0 && (
                        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white leading-none">
                          {approvalCount}
                        </span>
                      )}
                      {section.label === "My Requests" && myPendingCount > 0 && (
                        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white leading-none">
                          {myPendingCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
