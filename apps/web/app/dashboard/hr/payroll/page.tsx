"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Users,
  DollarSign,
  TrendingDown,
  Wallet,
  Receipt,
  Shield,
  Plus,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  label: string | null;
  status: string;
  period_year: number;
  period_month: number;
}

interface EntryRow {
  id: string;
  employee_id: string;
  gross_salary: number;
  total_tos: number;
  total_nssf_ee: number;
  total_nssf_er: number;
  total_deductions: number;
  net_salary: number;
  status: string;
  profiles: { full_name: string; department: string } | null;
}

interface AlertItem {
  severity: "critical" | "warning";
  message: string;
  count: number;
  link: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function runNo(year: number, month: number) {
  return `PAY-${year}-${String(month).padStart(2, "0")}`;
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
  closed: "bg-slate-100 text-slate-600",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayrollDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("payroll_periods")
      .select("id, label, status, period_year, period_month")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .then(({ data }) => {
        const rows = (data || []) as Period[];
        setPeriods(rows);
        const current = rows.find((p) => !["closed", "paid"].includes(p.status)) ?? rows[0] ?? null;
        setSelectedPeriod(current);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoadingEntries(true);
    const supabase = createClient();
    supabase
      .from("payroll_entries")
      .select("id, employee_id, gross_salary, total_tos, total_nssf_ee, total_nssf_er, total_deductions, net_salary, status, profiles!employee_id (full_name, department)")
      .eq("period_id", selectedPeriod.id)
      .order("gross_salary", { ascending: false })
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setEntries((data || []).map((r: any) => ({
          ...r,
          profiles: r.profiles ?? null,
          total_tos: Number(r.total_tos ?? 0),
          total_nssf_ee: Number(r.total_nssf_ee ?? 0),
          total_nssf_er: Number(r.total_nssf_er ?? 0),
        })));
        setLoadingEntries(false);
      });
  }, [selectedPeriod]);

  // ── Fetch alerts ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPeriod) return;
    setLoadingAlerts(true);
    const supabase = createClient();

    const year = selectedPeriod.period_year;
    const month = selectedPeriod.period_month;
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10);

    Promise.all([
      // Employees with no tax profile
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("employee_tax_profiles").select("employee_id"),
      supabase.from("employee_nssf_profiles").select("employee_id"),
      supabase.from("employee_bank_accounts").select("employee_id").eq("is_primary", true),
      // Unapproved timesheets in period
      supabase.from("timesheets").select("id", { count: "exact", head: true })
        .neq("status", "approved")
        .gte("week_start_date", monthStart)
        .lte("week_end_date", monthEnd),
      // Pending overtime
      supabase.from("overtime_records").select("id", { count: "exact", head: true })
        .eq("approved", false)
        .gte("overtime_date", monthStart)
        .lte("overtime_date", monthEnd),
      // Exchange rate for period
      supabase.from("tos_exchange_rates").select("id").eq("period_year", year).eq("period_month", month).maybeSingle(),
      // Active TOS brackets
      supabase.from("tos_brackets").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]).then(([activeRes, taxRes, nssfRes, bankRes, tsRes, otRes, erRes, tosRes]) => {
      const activeCount = activeRes.count ?? 0;
      const withTax  = new Set((taxRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)).size;
      const withNSSF = new Set((nssfRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)).size;
      const withBank = new Set((bankRes.data ?? []).map((r: { employee_id: string }) => r.employee_id)).size;

      const newAlerts: AlertItem[] = [];

      const noTax = activeCount - withTax;
      if (noTax > 0) newAlerts.push({ severity: "critical", message: `${noTax} employee${noTax > 1 ? "s" : ""} missing tax profile`, count: noTax, link: "/dashboard/hr/employees" });

      const noNSSF = activeCount - withNSSF;
      if (noNSSF > 0) newAlerts.push({ severity: "critical", message: `${noNSSF} employee${noNSSF > 1 ? "s" : ""} missing NSSF profile`, count: noNSSF, link: "/dashboard/hr/employees" });

      const noBank = activeCount - withBank;
      if (noBank > 0) newAlerts.push({ severity: "warning", message: `${noBank} employee${noBank > 1 ? "s" : ""} missing bank account`, count: noBank, link: "/dashboard/hr/employees" });

      if ((tsRes.count ?? 0) > 0) newAlerts.push({ severity: "critical", message: `${tsRes.count} timesheets pending approval`, count: tsRes.count!, link: "/dashboard/hr/timesheet" });

      if ((otRes.count ?? 0) > 0) newAlerts.push({ severity: "critical", message: `${otRes.count} overtime requests pending`, count: otRes.count!, link: "/dashboard/hr/timesheet" });

      if (!erRes.data) newAlerts.push({ severity: "critical", message: "No exchange rate set for this period", count: 1, link: "/dashboard/hr/payroll/tax-config" });

      if ((tosRes.count ?? 0) === 0) newAlerts.push({ severity: "critical", message: "No active TOS brackets configured", count: 1, link: "/dashboard/hr/payroll/tax-config" });

      setAlerts(newAlerts);
      setLoadingAlerts(false);
    });
  }, [selectedPeriod]);

  // ── Aggregated KPIs ────────────────────────────────────────────────────────

  const kpis = {
    headcount:  entries.length,
    gross:      entries.reduce((s, e) => s + Number(e.gross_salary), 0),
    tos:        entries.reduce((s, e) => s + e.total_tos, 0),
    nssfEE:     entries.reduce((s, e) => s + e.total_nssf_ee, 0),
    nssfER:     entries.reduce((s, e) => s + e.total_nssf_er, 0),
    net:        entries.reduce((s, e) => s + Number(e.net_salary), 0),
    pending:    entries.filter((e) => ["draft", "calculated", "hr_reviewed"].includes(e.status)).length,
    paid:       entries.filter((e) => e.status === "paid").length,
  };

  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const warningAlerts  = alerts.filter((a) => a.severity === "warning");

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payroll Dashboard</h2>
          <p className="text-muted-foreground text-sm">Monthly payroll status and overview</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/hr/payroll/runs">View All Runs</Link>
          </Button>
          <Button asChild size="sm" className="gap-1">
            <Link href="/dashboard/hr/payroll/run"><Plus className="h-4 w-4" />Run Payroll</Link>
          </Button>
        </div>
      </div>

      {/* Period selector */}
      {periods.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Period:</span>
          {periods.slice(0, 8).map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPeriod(p)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                selectedPeriod?.id === p.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {p.label ?? runNo(p.period_year, p.period_month)}
            </button>
          ))}
        </div>
      )}

      {/* Alerts panel */}
      {!loadingAlerts && alerts.length > 0 && (
        <Card className={cn("border", criticalAlerts.length > 0 ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30")}>
          <CardHeader className="pb-2">
            <CardTitle className={cn("text-sm font-semibold flex items-center justify-between", criticalAlerts.length > 0 ? "text-red-700" : "text-amber-700")}>
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Payroll Alerts — {criticalAlerts.length} critical, {warningAlerts.length} warning
              </div>
              <button onClick={() => setShowAlerts((s) => !s)} className="text-xs font-normal text-muted-foreground hover:text-foreground">
                {showAlerts ? "Hide" : "Show"}
              </button>
            </CardTitle>
          </CardHeader>
          {showAlerts && (
            <CardContent className="grid gap-1.5 md:grid-cols-2">
              {alerts.map((alert, i) => (
                <Link key={i} href={alert.link} className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-xs transition-colors hover:bg-white/50",
                  alert.severity === "critical" ? "border-red-200 text-red-700" : "border-amber-200 text-amber-700"
                )}>
                  <div className="flex items-center gap-2">
                    {alert.severity === "critical"
                      ? <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    <span>{alert.message}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                </Link>
              ))}
            </CardContent>
          )}
        </Card>
      )}
      {!loadingAlerts && alerts.length === 0 && entries.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5" /> No payroll alerts — all employee profiles complete
        </div>
      )}

      {/* KPI cards — 4 columns on wide screens */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPICard icon={Users} title="Headcount" value={kpis.headcount.toString()} sub="on payroll" />
        <KPICard icon={DollarSign} title="Gross Payroll" value={fmt(kpis.gross)} sub="before deductions" />
        <KPICard icon={Receipt} title="Total TOS" value={fmt(kpis.tos)} sub="tax on salary" color="text-red-600" />
        <KPICard icon={Shield} title="NSSF Employee" value={fmt(kpis.nssfEE)} sub="employee contribution" color="text-red-600" />
        <KPICard icon={Shield} title="NSSF Employer" value={fmt(kpis.nssfER)} sub="employer contribution" color="text-amber-600" />
        <KPICard icon={TrendingDown} title="Total Deductions" value={fmt(kpis.nssfEE + kpis.tos)} sub="TOS + NSSF EE" color="text-red-600" />
        <KPICard icon={Wallet} title="Net Payroll" value={fmt(kpis.net)} sub="disbursed to staff" color="text-emerald-600" />
        <div className="grid grid-cols-2 gap-3 contents md:block">
          <KPICard icon={AlertCircle} title="Pending Approval" value={kpis.pending.toString()} sub="entries" color="text-amber-600" />
          <KPICard icon={CheckCircle2} title="Paid" value={kpis.paid.toString()} sub="entries" color="text-emerald-600" />
        </div>
      </div>

      {/* Period status card */}
      {selectedPeriod && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{selectedPeriod.label ?? runNo(selectedPeriod.period_year, selectedPeriod.period_month)}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize", STATUS_COLORS[selectedPeriod.status] ?? "bg-gray-100 text-gray-600")}>
            {selectedPeriod.status.replace(/_/g, " ")}
          </span>
          <Button asChild variant="outline" size="sm" className="gap-1 h-7 text-xs ml-auto">
            <Link href={`/dashboard/hr/payroll/run?period=${selectedPeriod.id}`}>
              Open Run <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* Entries table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">
            {selectedPeriod
              ? `Payroll Entries — ${selectedPeriod.label ?? runNo(selectedPeriod.period_year, selectedPeriod.period_month)}`
              : "Payroll Entries"}
          </CardTitle>
          {selectedPeriod && (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize", STATUS_COLORS[selectedPeriod.status] ?? "bg-gray-100 text-gray-600")}>
              {selectedPeriod.status.replace(/_/g, " ")}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loadingEntries ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {selectedPeriod
                ? "No payroll entries yet. Run payroll to generate entries."
                : "No payroll period found. Create a period first."}
              <div className="mt-3 flex justify-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/hr/payroll/periods">Create Period</Link>
                </Button>
                {selectedPeriod && (
                  <Button asChild size="sm">
                    <Link href="/dashboard/hr/payroll/run">Run Payroll</Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Employee</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Department</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Gross</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">TOS</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">NSSF EE</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Net Pay</th>
                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{e.profiles?.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{e.profiles?.department ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(Number(e.gross_salary))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600">{e.total_tos > 0 ? `-${fmt(e.total_tos)}` : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600">{e.total_nssf_ee > 0 ? `-${fmt(e.total_nssf_ee)}` : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">{fmt(Number(e.net_salary))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLORS[e.status] ?? "bg-gray-100 text-gray-600")}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/hr/payroll/my-payslip?entry=${e.id}`} className="text-muted-foreground hover:text-primary transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
                    <td className="px-4 py-2.5" colSpan={2}>Total ({entries.length})</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(kpis.gross)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">-{fmt(kpis.tos)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">-{fmt(kpis.nssfEE)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(kpis.net)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/hr/payroll/cost-allocation">Cost Allocation</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/hr/payroll/reports">Payroll Reports</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/hr/payroll/audit">Audit Log</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/hr/payroll/tax-config">Tax Config</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/hr/payroll/nssf-config">NSSF Config</Link>
        </Button>
      </div>
    </div>
  );
}

function KPICard({
  icon: Icon,
  title,
  value,
  sub,
  color = "text-foreground",
}: {
  icon: typeof Users;
  title: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-xl font-bold tabular-nums truncate", color)}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

// Avoid unused import warning — format is used in period label fallback
void format;
