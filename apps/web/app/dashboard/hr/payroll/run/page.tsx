"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  X,
  Lock,
  Send,
  ArrowRight,
  DollarSign,
  Users,
  Clock,
} from "lucide-react";
import { format, getDaysInMonth, eachDayOfInterval, isWeekend } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";
import {
  calculatePIT,
  calculateNSSF_EE,
  calculateNSSF_ER,
  calculateTOS_KHR,
  calculateNonResidentTOS,
  calculateNSSF,
  type TOSBracket,
  type DependentRelief,
  type NSSFRuleSimple,
} from "@/components/hr/payroll/pit-calculator";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  label: string;
  status: string;
  period_year: number;
  period_month: number;
  start_date: string;
  end_date: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  director_approved_by: string | null;
  director_approved_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
}

interface PreviewRow {
  employee_id: string;
  full_name: string;
  department: string;
  basic: number;
  otEarnings: number;
  otHours: number;
  totalEarnings: number;
  nssfEE: number;
  nssfER: number;
  tos: number;
  taxReliefKHR: number;
  taxableIncome: number;
  exchangeRate: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  taxResidency: string;
  validationIssues: ValidationIssue[];
  lines: { component_type_id: string; amount: number; note: string }[];
  // Detail breakdown
  earningsBreakdown: { label: string; amount: number }[];
  deductionsBreakdown: { label: string; amount: number }[];
  attendanceSummary: { working: number; present: number; leave: number; ot: number };
}

interface ValidationIssue {
  severity: "critical" | "warning";
  message: string;
  field: string;
}

// ─── Workflow steps ────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { key: "open",               label: "Open",              shortLabel: "Open" },
  { key: "calculated",         label: "Calculated",        shortLabel: "Calc'd" },
  { key: "hr_reviewed",        label: "HR Reviewed",       shortLabel: "HR Rev" },
  { key: "finance_verified",   label: "Finance Verified",  shortLabel: "Finance" },
  { key: "director_approved",  label: "Dir. Approved",     shortLabel: "Dir." },
  { key: "locked",             label: "Locked",            shortLabel: "Locked" },
  { key: "exported",           label: "Exported",          shortLabel: "Exp'd" },
  { key: "paid",               label: "Paid",              shortLabel: "Paid" },
];

const STATUS_ORDER = WORKFLOW_STEPS.map((s) => s.key);

function getStepIndex(status: string) {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-gray-100 text-gray-600",
  draft: "bg-gray-100 text-gray-600",
  calculated: "bg-blue-100 text-blue-700",
  hr_reviewed: "bg-indigo-100 text-indigo-700",
  finance_verified: "bg-violet-100 text-violet-700",
  director_approved: "bg-amber-100 text-amber-700",
  locked: "bg-orange-100 text-orange-700",
  exported: "bg-cyan-100 text-cyan-700",
  paid: "bg-emerald-100 text-emerald-800",
  processing: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
};

// ─── Workflow status bar ───────────────────────────────────────────────────────

function WorkflowBar({ status }: { status: string }) {
  const currentIdx = getStepIndex(status);
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const current = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center">
            <div className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              done && "bg-emerald-100 text-emerald-700",
              current && "bg-primary text-primary-foreground shadow-sm",
              !done && !current && "bg-muted/50 text-muted-foreground",
            )}>
              {done ? <CheckCircle2 className="h-3 w-3" /> : null}
              <span className="hidden md:inline">{step.label}</span>
              <span className="md:hidden">{step.shortLabel}</span>
            </div>
            {idx < WORKFLOW_STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Validation panel ─────────────────────────────────────────────────────────

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const criticals = issues.filter((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning");
  return (
    <Card className={cn("border", criticals.length > 0 ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30")}>
      <CardHeader className="pb-2">
        <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", criticals.length > 0 ? "text-red-700" : "text-amber-700")}>
          {criticals.length > 0 ? <AlertCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          Payroll Validation — {criticals.length > 0 ? `${criticals.length} critical issue${criticals.length > 1 ? "s" : ""}` : `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {criticals.map((issue, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{issue.message}</span>
          </div>
        ))}
        {warnings.map((issue, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{issue.message}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Employee detail drawer ───────────────────────────────────────────────────

function EmployeeDrawer({ row, onClose }: { row: PreviewRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-background border-l border-border shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <div>
            <h3 className="font-semibold">{row.full_name}</h3>
            <p className="text-xs text-muted-foreground capitalize">{row.department}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Net summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Gross", value: fmt(row.totalEarnings), color: "text-foreground" },
              { label: "Deductions", value: fmt(row.totalDeductions), color: "text-red-600" },
              { label: "Net Pay", value: fmt(row.netSalary), color: "text-emerald-600" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-border p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                <p className={cn("text-sm font-bold tabular-nums", kpi.color)}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Attendance */}
          <section className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-2">
              <Users className="h-3 w-3" /> Attendance
            </h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-muted-foreground">Working Days</p><p className="font-semibold">{row.attendanceSummary.working}</p></div>
              <div><p className="text-muted-foreground">Present</p><p className="font-semibold">{row.attendanceSummary.present}</p></div>
              <div><p className="text-muted-foreground">Leave Days</p><p className="font-semibold">{row.attendanceSummary.leave}</p></div>
            </div>
            {row.attendanceSummary.ot > 0 && (
              <div className="mt-2 text-xs">
                <p className="text-muted-foreground">OT Hours</p>
                <p className="font-semibold">{row.attendanceSummary.ot.toFixed(1)} hrs</p>
              </div>
            )}
          </section>

          {/* Earnings */}
          <section className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-2">
              <DollarSign className="h-3 w-3" /> Earnings
            </h4>
            <div className="space-y-1">
              {row.earningsBreakdown.map((e, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{e.label}</span>
                  <span className="tabular-nums font-medium">{fmt(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold border-t border-border pt-1 mt-1">
                <span>Gross Total</span>
                <span className="tabular-nums">{fmt(row.totalEarnings)}</span>
              </div>
            </div>
          </section>

          {/* TOS Calculation */}
          <section className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tax on Salary (TOS)</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Residency</span>
                <span className="capitalize font-medium">{row.taxResidency === "non_resident" ? "Non-Resident (flat 20%)" : "Resident"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Income</span>
                <span className="tabular-nums">{fmt(row.totalEarnings)}</span>
              </div>
              {row.taxReliefKHR > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Dependent Relief</span>
                  <span className="tabular-nums">-{row.taxReliefKHR.toLocaleString()} KHR</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable Income</span>
                <span className="tabular-nums">{fmt(row.taxableIncome)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-border pt-1">
                <span>TOS</span>
                <span className="tabular-nums text-red-600">-{fmt(row.tos)}</span>
              </div>
            </div>
          </section>

          {/* NSSF */}
          <section className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">NSSF</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employee Contribution</span>
                <span className="tabular-nums text-red-600">-{fmt(row.nssfEE)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employer Contribution</span>
                <span className="tabular-nums text-amber-600">{fmt(row.nssfER)}</span>
              </div>
            </div>
          </section>

          {/* Deductions */}
          <section className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">All Deductions</h4>
            <div className="space-y-1">
              {row.deductionsBreakdown.map((d, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="tabular-nums text-red-600">-{fmt(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold border-t border-border pt-1">
                <span>Total Deductions</span>
                <span className="tabular-nums text-red-600">-{fmt(row.totalDeductions)}</span>
              </div>
            </div>
          </section>

          {/* Net */}
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-800">Net Salary</span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums">{fmt(row.netSalary)}</span>
          </div>

          {/* Validation issues for this employee */}
          {row.validationIssues.length > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <h4 className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Issues ({row.validationIssues.length})
              </h4>
              <div className="space-y-1">
                {row.validationIssues.map((issue, i) => (
                  <p key={i} className={cn("text-xs", issue.severity === "critical" ? "text-red-700" : "text-amber-700")}>
                    {issue.severity === "critical" ? "⚠ " : "• "}{issue.message}
                  </p>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function RunPayrollInner() {
  const searchParams = useSearchParams();
  const preselectedPeriodId = searchParams.get("period");

  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [componentTypeMap, setComponentTypeMap] = useState<Record<string, { id: string; code: string; category: string; is_system: boolean }>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<PreviewRow | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // DB-driven tax/NSSF rules
  const [tosBrackets, setTosBrackets] = useState<TOSBracket[]>([]);
  const [tosRelief, setTosRelief] = useState<{ spouse: number; child: number }>({ spouse: 150000, child: 150000 });
  const [exchangeRate, setExchangeRate] = useState<number>(4000);
  const [nssfRules, setNssfRules] = useState<NSSFRuleSimple[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => { if (data.user) setCurrentUserId(data.user.id); });

    const today = new Date();
    const yr = today.getFullYear();
    const mo = today.getMonth() + 1;

    Promise.all([
      supabase.from("payroll_periods").select("*").order("period_year", { ascending: false }).order("period_month", { ascending: false }),
      supabase.from("payroll_component_types").select("id, code, category, is_system, name"),
      // Fetch active TOS brackets
      supabase.from("tos_brackets").select("from_khr, to_khr, rate_percent, tolerance_khr").eq("status", "active").order("from_khr"),
      // Fetch active dependent relief
      supabase.from("tos_dependent_relief").select("relief_type, amount_khr").eq("status", "active"),
      // Fetch exchange rate for current/most-recent period
      supabase.from("tos_exchange_rates").select("rate_khr_per_usd").eq("period_year", yr).eq("period_month", mo).maybeSingle(),
      // Fetch active NSSF rules
      supabase.from("nssf_rules").select("contribution_type, contributor, rate_percent, max_wage_base, apply_cap").eq("status", "active"),
    ]).then(([pRes, ctRes, tosRes, reliefRes, erRes, nssfRes]) => {
      const ps = (pRes.data ?? []) as Period[];
      setPeriods(ps);

      const map: Record<string, { id: string; code: string; category: string; is_system: boolean }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ct of (ctRes.data ?? []) as any[]) map[ct.code] = ct;
      setComponentTypeMap(map);

      // Set TOS brackets
      if (tosRes.data && tosRes.data.length > 0) {
        setTosBrackets(tosRes.data as TOSBracket[]);
      }
      // Set relief amounts
      if (reliefRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const spouseRow = (reliefRes.data as any[]).find((r) => r.relief_type === "spouse");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const childRow = (reliefRes.data as any[]).find((r) => r.relief_type === "child");
        setTosRelief({ spouse: spouseRow?.amount_khr ?? 150000, child: childRow?.amount_khr ?? 150000 });
      }
      // Set exchange rate
      if (erRes.data) setExchangeRate(Number(erRes.data.rate_khr_per_usd));
      // Set NSSF rules
      if (nssfRes.data) setNssfRules(nssfRes.data as NSSFRuleSimple[]);

      const pid = preselectedPeriodId ?? (ps[0]?.id ?? "");
      setSelectedPeriodId(pid);
      setSelectedPeriod(ps.find((p) => p.id === pid) ?? ps[0] ?? null);
      setLoadingPeriods(false);
    });
  }, [preselectedPeriodId]);

  function onPeriodChange(id: string) {
    setSelectedPeriodId(id);
    setSelectedPeriod(periods.find((p) => p.id === id) ?? null);
    setPreview([]);
  }

  // ── Calculate payroll ──────────────────────────────────────────────────────

  async function calculate() {
    if (!selectedPeriod) return;
    setCalculating(true);
    setPreview([]);

    const supabase = createClient();
    const year = selectedPeriod.period_year;
    const month = selectedPeriod.period_month;

    // Update exchange rate for this period if available in DB
    const erRes = await supabase.from("tos_exchange_rates").select("rate_khr_per_usd").eq("period_year", year).eq("period_month", month).maybeSingle();
    const periodExchangeRate = erRes.data ? Number(erRes.data.rate_khr_per_usd) : exchangeRate;

    const daysInMonth = getDaysInMonth(new Date(year, month - 1));
    const allDays = eachDayOfInterval({ start: new Date(year, month - 1, 1), end: new Date(year, month - 1, daysInMonth) });
    const totalWorkingDays = allDays.filter((d) => !isWeekend(d)).length;
    const monthStart = format(new Date(year, month - 1, 1), "yyyy-MM-dd");
    const monthEnd   = format(new Date(year, month - 1, daysInMonth), "yyyy-MM-dd");

    const [empRes, structRes, otRes, leaveRes, attendRes, taxProfileRes, payrollProfileRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, department, job_title"),
      supabase.from("employee_salary_structures")
        .select("employee_id, component_type_id, amount, payroll_component_types(code, category, is_taxable, is_system)")
        .is("effective_to", null),
      supabase.from("timesheet_entries")
        .select("employee_id, ot_hours, ot_type, timesheets!inner(week_start_date, week_end_date, status)")
        .gte("timesheets.week_start_date", monthStart)
        .lte("timesheets.week_end_date", monthEnd)
        .in("timesheets.status", ["approved"]),
      supabase.from("leave_requests")
        .select("employee_id, start_date, end_date")
        .eq("status", "approved")
        .gte("end_date", monthStart)
        .lte("start_date", monthEnd),
      supabase.from("attendance_records")
        .select("employee_id, status")
        .gte("date", monthStart)
        .lte("date", monthEnd),
      // Fetch tax profiles for all employees
      supabase.from("employee_tax_profiles")
        .select("employee_id, tax_residency, marital_status, spouse_dependent, num_children")
        .order("effective_date", { ascending: false }),
      // Fetch payroll profiles for currency awareness
      supabase.from("employee_payroll_profiles")
        .select("employee_id, currency")
        .order("effective_date", { ascending: false }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees = (empRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structures = (structRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const otEntries  = (otRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaveReqs  = (leaveRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attendance = (attendRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taxProfiles = (taxProfileRes.data || []) as any[];

    // Build lookup maps
    const structByEmp: Record<string, typeof structures> = {};
    for (const s of structures) {
      if (!structByEmp[s.employee_id]) structByEmp[s.employee_id] = [];
      structByEmp[s.employee_id].push(s);
    }
    const otByEmp: Record<string, { ot150: number; ot200: number; holiday: number }> = {};
    for (const e of otEntries) {
      const eid = e.employee_id;
      if (!otByEmp[eid]) otByEmp[eid] = { ot150: 0, ot200: 0, holiday: 0 };
      const hours = parseFloat(e.ot_hours) || 0;
      if (e.ot_type === "1.5x") otByEmp[eid].ot150 += hours;
      else if (e.ot_type === "2.0x") otByEmp[eid].ot200 += hours;
      else if (e.ot_type === "holiday") otByEmp[eid].holiday += hours;
    }
    const leaveByEmp: Record<string, number> = {};
    for (const lr of leaveReqs) {
      const eid = lr.employee_id;
      const start = new Date(Math.max(new Date(lr.start_date).getTime(), new Date(monthStart).getTime()));
      const end   = new Date(Math.min(new Date(lr.end_date).getTime(), new Date(monthEnd).getTime()));
      if (start <= end) {
        const days = eachDayOfInterval({ start, end }).filter((d) => !isWeekend(d)).length;
        leaveByEmp[eid] = (leaveByEmp[eid] ?? 0) + days;
      }
    }
    const presentByEmp: Record<string, number> = {};
    for (const a of attendance) {
      if (["present", "late", "wfh", "site_work"].includes((a.status || "").toLowerCase())) {
        presentByEmp[a.employee_id] = (presentByEmp[a.employee_id] ?? 0) + 1;
      }
    }
    // Latest tax profile per employee
    const taxProfileByEmp: Record<string, typeof taxProfiles[0]> = {};
    for (const tp of taxProfiles) {
      if (!taxProfileByEmp[tp.employee_id]) taxProfileByEmp[tp.employee_id] = tp;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payrollProfiles = (payrollProfileRes.data || []) as any[];
    const currencyByEmp: Record<string, string> = {};
    for (const pp of payrollProfiles) {
      if (!currencyByEmp[pp.employee_id]) currencyByEmp[pp.employee_id] = pp.currency;
    }

    const employeesWithStructure = employees.filter((e) => structByEmp[e.id]?.length > 0);

    const rows: PreviewRow[] = employeesWithStructure.map((emp) => {
      const empStructure = structByEmp[emp.id] ?? [];
      const ot = otByEmp[emp.id] ?? { ot150: 0, ot200: 0, holiday: 0 };
      const leaveDays = leaveByEmp[emp.id] ?? 0;
      const presentDays = presentByEmp[emp.id] ?? totalWorkingDays;
      const taxProfile = taxProfileByEmp[emp.id];

      const basic = empStructure.filter((s: { payroll_component_types: { code: string } }) => s.payroll_component_types?.code === "BASIC").reduce((sum: number, s: { amount: number }) => sum + Number(s.amount), 0);
      const workingDaysInMonth = 26;
      const hourlyRate = basic / workingDaysInMonth / 8;

      const ot150Amt     = ot.ot150 * hourlyRate * 1.5;
      const ot200Amt     = ot.ot200 * hourlyRate * 2.0;
      const otHolidayAmt = ot.holiday * hourlyRate * 2.0;
      const otEarnings   = ot150Amt + ot200Amt + otHolidayAmt;
      const otHours      = ot.ot150 + ot.ot200 + ot.holiday;

      const structureEarnings = empStructure
        .filter((s: { payroll_component_types: { category: string; is_system: boolean } }) => s.payroll_component_types?.category === "earning" && !s.payroll_component_types?.is_system)
        .reduce((sum: number, s: { amount: number }) => sum + Number(s.amount), 0);

      const structureDeductions = empStructure
        .filter((s: { payroll_component_types: { category: string; is_system: boolean } }) => s.payroll_component_types?.category === "deduction" && !s.payroll_component_types?.is_system)
        .reduce((sum: number, s: { amount: number }) => sum + Number(s.amount), 0);

      const totalEarnings = structureEarnings + otEarnings;
      const currency = currencyByEmp[emp.id] ?? "USD";
      const totalEarningsUSD = currency === "KHR" ? totalEarnings / periodExchangeRate : totalEarnings;

      // Cambodia TOS calculation
      let tos = 0;
      let taxReliefKHR = 0;
      let taxableIncome = totalEarningsUSD;
      const taxResidency = taxProfile?.tax_residency ?? "resident";

      if (taxResidency === "non_resident") {
        tos = calculateNonResidentTOS(totalEarningsUSD);
        taxableIncome = totalEarningsUSD;
      } else if (tosBrackets.length > 0) {
        // DB-driven KHR calculation
        const spouseRelief = (taxProfile?.spouse_dependent && taxProfile?.marital_status === "married") ? tosRelief.spouse : 0;
        const childRelief = (taxProfile?.num_children ?? 0) * tosRelief.child;
        taxReliefKHR = spouseRelief + childRelief;
        const relief: DependentRelief = { spouse: spouseRelief, children: childRelief };
        const totalEarningsKHR = currency === "KHR" ? totalEarnings : totalEarningsUSD * periodExchangeRate;
        const tosKHR = calculateTOS_KHR(totalEarningsKHR, tosBrackets, relief);
        tos = Math.round((tosKHR / periodExchangeRate) * 100) / 100;
        taxableIncome = Math.max(0, totalEarningsUSD - taxReliefKHR / periodExchangeRate);
      } else {
        // Legacy fallback
        tos = calculatePIT(totalEarningsUSD);
        taxableIncome = totalEarningsUSD;
      }

      // NSSF calculation
      let nssfEE: number;
      let nssfER: number;
      if (nssfRules.length > 0) {
        nssfEE = calculateNSSF(totalEarningsUSD, nssfRules, "employee");
        nssfER = calculateNSSF(totalEarningsUSD, nssfRules, "employer");
      } else {
        nssfEE = calculateNSSF_EE(totalEarningsUSD);
        nssfER = calculateNSSF_ER(totalEarningsUSD);
      }

      const totalDeductions = nssfEE + tos + structureDeductions;
      const netSalary = Math.max(0, totalEarningsUSD - totalDeductions);

      // Build validation issues for this employee
      const validationIssues: ValidationIssue[] = [];
      if (!taxProfile) {
        validationIssues.push({ severity: "critical", message: "No tax profile configured", field: "tax_profile" });
      }
      if (netSalary < 0) {
        validationIssues.push({ severity: "critical", message: "Net salary is negative", field: "net_salary" });
      }

      // Build entry lines
      const lines: { component_type_id: string; amount: number; note: string }[] = [];
      for (const s of empStructure.filter((s: { payroll_component_types: { is_system: boolean } }) => !s.payroll_component_types?.is_system)) {
        lines.push({ component_type_id: s.component_type_id, amount: Number(s.amount), note: "" });
      }
      if (ot150Amt > 0 && componentTypeMap["OT_150"]) lines.push({ component_type_id: componentTypeMap["OT_150"].id, amount: Math.round(ot150Amt * 100) / 100, note: `${ot.ot150.toFixed(1)} hrs × $${hourlyRate.toFixed(2)} × 1.5` });
      if (ot200Amt > 0 && componentTypeMap["OT_200"]) lines.push({ component_type_id: componentTypeMap["OT_200"].id, amount: Math.round(ot200Amt * 100) / 100, note: `${ot.ot200.toFixed(1)} hrs × $${hourlyRate.toFixed(2)} × 2.0` });
      if (otHolidayAmt > 0 && componentTypeMap["OT_HOLIDAY"]) lines.push({ component_type_id: componentTypeMap["OT_HOLIDAY"].id, amount: Math.round(otHolidayAmt * 100) / 100, note: `${ot.holiday.toFixed(1)} holiday hrs × $${hourlyRate.toFixed(2)} × 2.0` });
      if (nssfEE > 0 && componentTypeMap["NSSF_EE"]) lines.push({ component_type_id: componentTypeMap["NSSF_EE"].id, amount: nssfEE, note: "NSSF Employee contribution" });
      if (tos > 0 && componentTypeMap["PIT"]) lines.push({ component_type_id: componentTypeMap["PIT"].id, amount: tos, note: "Cambodia TOS" });

      // Build breakdown arrays for drawer
      const earningsBreakdown = empStructure
        .filter((s: { payroll_component_types: { category: string; is_system: boolean } }) => s.payroll_component_types?.category === "earning" && !s.payroll_component_types?.is_system)
        .map((s: { payroll_component_types: { name: string }; amount: number }) => ({ label: s.payroll_component_types?.name ?? "—", amount: Number(s.amount) }));
      if (otEarnings > 0) earningsBreakdown.push({ label: "Overtime", amount: Math.round(otEarnings * 100) / 100 });

      const deductionsBreakdown = [
        ...(tos > 0 ? [{ label: "Tax on Salary (TOS)", amount: tos }] : []),
        ...(nssfEE > 0 ? [{ label: "NSSF Employee", amount: nssfEE }] : []),
        ...empStructure
          .filter((s: { payroll_component_types: { category: string; is_system: boolean } }) => s.payroll_component_types?.category === "deduction" && !s.payroll_component_types?.is_system)
          .map((s: { payroll_component_types: { name: string }; amount: number }) => ({ label: s.payroll_component_types?.name ?? "Deduction", amount: Number(s.amount) })),
      ];

      const basicUSD = currency === "KHR" ? basic / periodExchangeRate : basic;
      const otEarningsUSD = currency === "KHR" ? otEarnings / periodExchangeRate : otEarnings;

      return {
        employee_id: emp.id,
        full_name: emp.full_name,
        department: emp.department ?? "",
        basic: Math.round(basicUSD * 100) / 100,
        otEarnings: Math.round(otEarningsUSD * 100) / 100,
        otHours,
        totalEarnings: Math.round(totalEarningsUSD * 100) / 100,
        nssfEE,
        nssfER,
        tos,
        taxReliefKHR,
        taxableIncome: Math.round(taxableIncome * 100) / 100,
        exchangeRate: periodExchangeRate,
        otherDeductions: structureDeductions,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        netSalary: Math.round(netSalary * 100) / 100,
        workingDays: totalWorkingDays,
        presentDays,
        leaveDays,
        taxResidency,
        validationIssues,
        lines,
        earningsBreakdown,
        deductionsBreakdown,
        attendanceSummary: { working: totalWorkingDays, present: presentDays, leave: leaveDays, ot: otHours },
      };
    });

    setPreview(rows);
    setCalculating(false);
  }

  // ── Save payroll entries ───────────────────────────────────────────────────

  async function savePayroll() {
    if (!selectedPeriod || preview.length === 0) return;
    setSaving(true);
    const supabase = createClient();

    for (const row of preview) {
      const { data: entry, error: entryErr } = await supabase
        .from("payroll_entries")
        .upsert({
          period_id: selectedPeriod.id,
          employee_id: row.employee_id,
          gross_salary: row.totalEarnings,
          total_deductions: row.totalDeductions,
          employer_contributions: row.nssfER,
          net_salary: row.netSalary,
          total_tos: row.tos,
          total_nssf_ee: row.nssfEE,
          total_nssf_er: row.nssfER,
          tax_relief_khr: row.taxReliefKHR,
          taxable_income: row.taxableIncome,
          exchange_rate: row.exchangeRate,
          working_days: row.workingDays,
          present_days: row.presentDays,
          leave_days: row.leaveDays,
          ot_hours: row.otHours,
          status: "draft",
          calculated_at: new Date().toISOString(),
          calculated_by: currentUserId,
        }, { onConflict: "period_id,employee_id" })
        .select("id")
        .single();

      if (entryErr || !entry) continue;

      await supabase.from("payroll_entry_lines").delete().eq("entry_id", entry.id);
      if (row.lines.length > 0) {
        await supabase.from("payroll_entry_lines").insert(row.lines.map((l) => ({ entry_id: entry.id, ...l })));
      }
    }

    // Advance period to "calculated"
    await supabase.from("payroll_periods").update({ status: "calculated" }).eq("id", selectedPeriod.id);

    // Log audit event
    await supabase.from("payroll_audit_log").insert({
      period_id: selectedPeriod.id,
      user_id: currentUserId,
      action: "payroll_calculated",
      record_type: "period",
      record_id: selectedPeriod.id,
      new_value: { employees: preview.length, status: "calculated" },
    });

    toast.success(`Payroll calculated for ${selectedPeriod.label} — ${preview.length} employees`);
    setSelectedPeriod((p) => p ? { ...p, status: "calculated" } : p);
    setPeriods((ps) => ps.map((p) => p.id === selectedPeriod.id ? { ...p, status: "calculated" } : p));
    setSaving(false);
  }

  // ── Workflow transitions ───────────────────────────────────────────────────

  async function advanceWorkflow(toStatus: string, action: string) {
    if (!selectedPeriod) return;

    // Confirm for irreversible actions
    if (toStatus === "locked") {
      const totalNet = preview.reduce((s, r) => s + r.netSalary, 0);
      const confirmed = window.confirm(`Lock payroll ${selectedPeriod.label}?\n\nTotal Net: $${totalNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}\n${preview.length} employees\n\nThis cannot be undone.`);
      if (!confirmed) return;
    }
    if (toStatus === "paid") {
      const confirmed = window.confirm(`Mark payroll ${selectedPeriod.label} as PAID? This is the final state.`);
      if (!confirmed) return;
    }

    setTransitioning(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = { status: toStatus };
    if (toStatus === "hr_reviewed")       { updates.reviewed_by = currentUserId; updates.reviewed_at = now; }
    if (toStatus === "finance_verified")  { updates.verified_by = currentUserId; updates.verified_at = now; }
    if (toStatus === "director_approved") { updates.director_approved_by = currentUserId; updates.director_approved_at = now; }
    if (toStatus === "locked")            { updates.locked_by = currentUserId; updates.locked_at = now; }
    if (toStatus === "exported")          { updates.exported_at = now; }

    const { error } = await supabase.from("payroll_periods").update(updates).eq("id", selectedPeriod.id);
    if (error) { toast.error(error.message); setTransitioning(false); return; }

    // Audit log
    await supabase.from("payroll_audit_log").insert({
      period_id: selectedPeriod.id,
      user_id: currentUserId,
      action,
      record_type: "period",
      record_id: selectedPeriod.id,
      old_value: { status: selectedPeriod.status },
      new_value: { status: toStatus },
    });

    toast.success(`Payroll ${toStatus.replace(/_/g, " ")}`);
    setSelectedPeriod((p) => p ? { ...p, status: toStatus, ...updates } as Period : p);
    setPeriods((ps) => ps.map((p) => p.id === selectedPeriod.id ? { ...p, status: toStatus } : p));
    setTransitioning(false);
  }

  // ── Action button by status ────────────────────────────────────────────────

  const allIssues = preview.flatMap((r) => r.validationIssues);
  const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
  const periodStatus = selectedPeriod?.status ?? "open";

  function ActionBar() {
    const isLocked = ["locked", "exported", "paid"].includes(periodStatus);
    const canRecalculate = ["open", "draft", "calculated"].includes(periodStatus) && !isLocked;

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {canRecalculate && (
          <Button onClick={calculate} disabled={calculating || !selectedPeriodId} variant="outline" className="gap-2">
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {calculating ? "Calculating…" : "Calculate All"}
          </Button>
        )}
        {preview.length > 0 && canRecalculate && (
          <Button onClick={savePayroll} disabled={saving} variant="outline" className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Saving…" : "Confirm & Save"}
          </Button>
        )}

        {periodStatus === "calculated" && (
          <Button onClick={() => advanceWorkflow("hr_reviewed", "submitted_for_hr_review")} disabled={transitioning || criticalCount > 0} className="gap-2">
            {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit for HR Review
            {criticalCount > 0 && <Badge className="bg-red-600 text-white ml-1">{criticalCount} issues</Badge>}
          </Button>
        )}
        {periodStatus === "hr_reviewed" && (
          <Button onClick={() => advanceWorkflow("finance_verified", "submitted_to_finance")} disabled={transitioning} className="gap-2">
            {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Submit to Finance
          </Button>
        )}
        {periodStatus === "finance_verified" && (
          <Button onClick={() => advanceWorkflow("director_approved", "submitted_to_director")} disabled={transitioning} className="gap-2">
            {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Submit to Director
          </Button>
        )}
        {periodStatus === "director_approved" && (
          <Button onClick={() => advanceWorkflow("locked", "payroll_locked")} disabled={transitioning} className="gap-2 bg-orange-600 hover:bg-orange-700">
            {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Lock Payroll
          </Button>
        )}
        {periodStatus === "locked" && (
          <Button onClick={() => advanceWorkflow("exported", "payroll_exported")} disabled={transitioning} className="gap-2">
            {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Export to Finance
          </Button>
        )}
        {periodStatus === "exported" && (
          <Button onClick={() => advanceWorkflow("paid", "payroll_marked_paid")} disabled={transitioning} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Mark as Paid
          </Button>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loadingPeriods) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Run Payroll</h2>
          <p className="text-muted-foreground text-sm">Calculate and process monthly salary</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/hr/payroll/runs"><ChevronLeft className="h-4 w-4 mr-1" />All Runs</Link>
          </Button>
        </div>
      </div>

      {periods.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-amber-500" />
            <p className="text-sm text-muted-foreground">No open periods available. Create a period first.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/hr/payroll/periods">Create Period</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Period selector + workflow status */}
          <Card>
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-48">
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Payroll Period</label>
                  <select
                    value={selectedPeriodId}
                    onChange={(e) => onPeriodChange(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label ?? `${p.period_year}-${String(p.period_month).padStart(2, "0")}`}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedPeriod && (
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium capitalize", STATUS_COLORS[periodStatus] ?? "bg-gray-100 text-gray-600")}>
                      {periodStatus.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(selectedPeriod.start_date), "d MMM")} – {format(new Date(selectedPeriod.end_date), "d MMM yyyy")}
                    </span>
                  </div>
                )}
              </div>

              {/* Workflow status bar */}
              {selectedPeriod && <WorkflowBar status={periodStatus} />}

              {/* Action buttons */}
              <ActionBar />
            </CardContent>
          </Card>

          {/* Validation panel */}
          {allIssues.length > 0 && <ValidationPanel issues={allIssues} />}

          {/* Preview table */}
          {preview.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm font-semibold">
                  Payroll Entries — {preview.length} employees
                </CardTitle>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Net: <span className="font-semibold text-emerald-600">{fmt(preview.reduce((s, r) => s + r.netSalary, 0))}</span></span>
                  <span>TOS: <span className="font-semibold text-red-600">{fmt(preview.reduce((s, r) => s + r.tos, 0))}</span></span>
                  <span>NSSF EE: <span className="font-semibold text-red-600">{fmt(preview.reduce((s, r) => s + r.nssfEE, 0))}</span></span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Employee</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Gross</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">OT</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">TOS</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">NSSF EE</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">NSSF ER</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Net Pay</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Issues</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.map((r) => (
                        <tr
                          key={r.employee_id}
                          className="hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => setSelectedEmployee(r)}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium">{r.full_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{r.department}</p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(r.totalEarnings)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-blue-600">
                            {r.otEarnings > 0 ? fmt(r.otEarnings) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-600">
                            {r.tos > 0 ? `-${fmt(r.tos)}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-600">
                            {r.nssfEE > 0 ? `-${fmt(r.nssfEE)}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                            {r.nssfER > 0 ? fmt(r.nssfER) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">
                            {fmt(r.netSalary)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.validationIssues.length > 0 ? (
                              <span className={cn("inline-flex items-center gap-1 text-xs font-medium",
                                r.validationIssues.some((i) => i.severity === "critical") ? "text-red-600" : "text-amber-600"
                              )}>
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {r.validationIssues.length}
                              </span>
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                        <td className="px-4 py-2.5 text-sm">Total ({preview.length})</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(preview.reduce((s, r) => s + r.totalEarnings, 0))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-blue-600">{fmt(preview.reduce((s, r) => s + r.otEarnings, 0))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-red-600">-{fmt(preview.reduce((s, r) => s + r.tos, 0))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-red-600">-{fmt(preview.reduce((s, r) => s + r.nssfEE, 0))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{fmt(preview.reduce((s, r) => s + r.nssfER, 0))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(preview.reduce((s, r) => s + r.netSalary, 0))}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                          {criticalCount > 0 ? <span className="text-red-600">{criticalCount} critical</span> : "✓ All clear"}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Read-only message for locked periods */}
          {["locked", "exported", "paid"].includes(periodStatus) && preview.length === 0 && (
            <Card className="border-orange-200 bg-orange-50/20">
              <CardContent className="py-8 text-center">
                <Lock className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                <p className="text-sm text-muted-foreground">
                  This payroll is <strong>{periodStatus}</strong> and cannot be recalculated.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <Link href={`/dashboard/hr/payroll?period=${selectedPeriod?.id}`}>
                    View Payroll Dashboard
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Clock info (exchange rate used) */}
          {tosBrackets.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              TOS calculated using {tosBrackets.length} KHR brackets · Exchange rate: {exchangeRate.toLocaleString()} KHR/USD
            </div>
          )}
        </>
      )}

      {/* Employee detail drawer */}
      {selectedEmployee && <EmployeeDrawer row={selectedEmployee} onClose={() => setSelectedEmployee(null)} />}
    </div>
  );
}

export default function RunPayrollPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>}>
      <RunPayrollInner />
    </Suspense>
  );
}
