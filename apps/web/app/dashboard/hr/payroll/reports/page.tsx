"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Download, FileText, BarChart2, Receipt, Shield, Clock, ClipboardList } from "lucide-react";

interface Period {
  id: string;
  label: string | null;
  period_year: number;
  period_month: number;
  status: string;
}

interface ReportEntry {
  id: string;
  employee_name: string;
  department: string;
  gross_salary: number;
  total_tos: number;
  total_nssf_ee: number;
  total_nssf_er: number;
  total_deductions: number;
  net_salary: number;
  ot_hours: number;
  status: string;
}

type ReportType = "payroll_register" | "tos_report" | "nssf_report" | "department_cost" | "overtime_report";

const REPORT_DEFS: { key: ReportType; label: string; description: string; icon: typeof FileText; userAccess: string }[] = [
  { key: "payroll_register", label: "Payroll Register",     description: "All employees with full salary breakdown", icon: FileText,  userAccess: "HR / Finance" },
  { key: "tos_report",       label: "Tax on Salary Report", description: "TOS per employee with effective rate",     icon: Receipt,   userAccess: "HR / Finance" },
  { key: "nssf_report",      label: "NSSF Report",          description: "Employee and employer NSSF contributions", icon: Shield,    userAccess: "HR / Finance" },
  { key: "department_cost",  label: "Cost by Department",   description: "Summarized payroll cost per department",   icon: BarChart2, userAccess: "Management" },
  { key: "overtime_report",  label: "Overtime Report",      description: "OT hours per employee",                    icon: Clock,     userAccess: "HR / Manager" },
];

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function runNo(y: number, m: number) {
  return `PAY-${y}-${String(m).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<string, string> = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  locked: "border-orange-200 bg-orange-50 text-orange-700",
  exported: "border-cyan-200 bg-cyan-50 text-cyan-700",
  calculated: "border-blue-200 bg-blue-50 text-blue-700",
};

export default function PayrollReportsPage() {
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [activeReport, setActiveReport] = useState<ReportType>("payroll_register");
  const [reportData, setReportData] = useState<ReportEntry[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("payroll_periods").select("id, label, period_year, period_month, status").order("period_year", { ascending: false }).order("period_month", { ascending: false })
      .then(({ data }) => {
        const ps = (data ?? []) as Period[];
        setPeriods(ps);
        if (ps.length > 0) setSelectedPeriod(ps[0]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoadingReport(true);
    const supabase = createClient();
    supabase.from("payroll_entries")
      .select("id, gross_salary, total_tos, total_nssf_ee, total_nssf_er, total_deductions, net_salary, ot_hours, status, profiles!employee_id(full_name, department)")
      .eq("period_id", selectedPeriod.id)
      .order("gross_salary", { ascending: false })
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setReportData(((data ?? []) as any[]).map((e) => ({
          id: e.id,
          employee_name: e.profiles?.full_name ?? "—",
          department: e.profiles?.department ?? "—",
          gross_salary: Number(e.gross_salary),
          total_tos: Number(e.total_tos ?? 0),
          total_nssf_ee: Number(e.total_nssf_ee ?? 0),
          total_nssf_er: Number(e.total_nssf_er ?? 0),
          total_deductions: Number(e.total_deductions),
          net_salary: Number(e.net_salary),
          ot_hours: Number(e.ot_hours ?? 0),
          status: e.status,
        })));
        setLoadingReport(false);
      });
  }, [selectedPeriod]);

  function exportCSV() {
    if (reportData.length === 0 || !selectedPeriod) return;
    const headers = ["Employee", "Department", "Gross", "TOS", "NSSF EE", "NSSF ER", "Net Pay", "Status"];
    const rows = reportData.map((e) => [e.employee_name, e.department, e.gross_salary.toFixed(2), e.total_tos.toFixed(2), e.total_nssf_ee.toFixed(2), e.total_nssf_er.toFixed(2), e.net_salary.toFixed(2), e.status]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${runNo(selectedPeriod.period_year, selectedPeriod.period_month)}-${activeReport}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Report tables ──────────────────────────────────────────────────────────

  const totals = {
    gross: reportData.reduce((s, e) => s + e.gross_salary, 0),
    tos:   reportData.reduce((s, e) => s + e.total_tos, 0),
    ee:    reportData.reduce((s, e) => s + e.total_nssf_ee, 0),
    er:    reportData.reduce((s, e) => s + e.total_nssf_er, 0),
    net:   reportData.reduce((s, e) => s + e.net_salary, 0),
    ot:    reportData.reduce((s, e) => s + e.ot_hours, 0),
  };

  function ReportTable() {
    if (loadingReport) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
    if (reportData.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No data for this period.</p>;

    if (activeReport === "payroll_register") {
      return (
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Employee</th>
            <th className="px-4 py-2.5 text-left font-medium">Dept</th>
            <th className="px-4 py-2.5 text-right font-medium">Gross</th>
            <th className="px-4 py-2.5 text-right font-medium">TOS</th>
            <th className="px-4 py-2.5 text-right font-medium">NSSF EE</th>
            <th className="px-4 py-2.5 text-right font-medium">NSSF ER</th>
            <th className="px-4 py-2.5 text-right font-medium">Net Pay</th>
            <th className="px-4 py-2.5 text-center font-medium">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {reportData.map((e) => (
              <tr key={e.id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{e.employee_name}</td>
                <td className="px-4 py-2.5 text-muted-foreground capitalize text-xs">{e.department}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(e.gross_salary)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{e.total_tos > 0 ? `-${fmt(e.total_tos)}` : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{e.total_nssf_ee > 0 ? `-${fmt(e.total_nssf_ee)}` : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{e.total_nssf_er > 0 ? fmt(e.total_nssf_er) : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{fmt(e.net_salary)}</td>
                <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={cn("capitalize text-[10px]", STATUS_COLORS[e.status] ?? "border-gray-200 text-gray-600")}>{e.status.replace(/_/g, " ")}</Badge></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
            <td className="px-4 py-2.5" colSpan={2}>Total ({reportData.length})</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totals.gross)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-red-600">-{fmt(totals.tos)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-red-600">-{fmt(totals.ee)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{fmt(totals.er)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(totals.net)}</td>
            <td />
          </tr></tfoot>
        </table>
      );
    }

    if (activeReport === "tos_report") {
      return (
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Employee</th><th className="px-4 py-2.5 text-left font-medium">Dept</th>
            <th className="px-4 py-2.5 text-right font-medium">Gross</th><th className="px-4 py-2.5 text-right font-medium">TOS</th>
            <th className="px-4 py-2.5 text-right font-medium">Effective Rate</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {reportData.map((e) => (
              <tr key={e.id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{e.employee_name}</td><td className="px-4 py-2.5 text-muted-foreground capitalize text-xs">{e.department}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(e.gross_salary)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(e.total_tos)}</td>
                <td className="px-4 py-2.5 text-right">{e.gross_salary > 0 ? ((e.total_tos / e.gross_salary) * 100).toFixed(2) + "%" : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
            <td className="px-4 py-2.5" colSpan={2}>Total</td>
            <td className="px-4 py-2.5 text-right">{fmt(totals.gross)}</td><td className="px-4 py-2.5 text-right text-red-600">{fmt(totals.tos)}</td><td />
          </tr></tfoot>
        </table>
      );
    }

    if (activeReport === "nssf_report") {
      return (
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Employee</th><th className="px-4 py-2.5 text-left font-medium">Dept</th>
            <th className="px-4 py-2.5 text-right font-medium">Gross</th>
            <th className="px-4 py-2.5 text-right font-medium">EE NSSF</th><th className="px-4 py-2.5 text-right font-medium">ER NSSF</th>
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {reportData.map((e) => (
              <tr key={e.id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{e.employee_name}</td><td className="px-4 py-2.5 text-muted-foreground capitalize text-xs">{e.department}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(e.gross_salary)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(e.total_nssf_ee)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{fmt(e.total_nssf_er)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(e.total_nssf_ee + e.total_nssf_er)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
            <td className="px-4 py-2.5" colSpan={2}>Total</td><td className="px-4 py-2.5 text-right">{fmt(totals.gross)}</td>
            <td className="px-4 py-2.5 text-right text-red-600">{fmt(totals.ee)}</td>
            <td className="px-4 py-2.5 text-right text-amber-600">{fmt(totals.er)}</td>
            <td className="px-4 py-2.5 text-right">{fmt(totals.ee + totals.er)}</td>
          </tr></tfoot>
        </table>
      );
    }

    if (activeReport === "department_cost") {
      const byDept: Record<string, { g: number; t: number; n: number; cnt: number }> = {};
      for (const e of reportData) {
        const d = e.department || "Unknown";
        if (!byDept[d]) byDept[d] = { g: 0, t: 0, n: 0, cnt: 0 };
        byDept[d].g += e.gross_salary; byDept[d].t += e.total_tos + e.total_nssf_ee; byDept[d].n += e.net_salary; byDept[d].cnt++;
      }
      return (
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Department</th><th className="px-4 py-2.5 text-center font-medium">Employees</th>
            <th className="px-4 py-2.5 text-right font-medium">Gross</th><th className="px-4 py-2.5 text-right font-medium">Deductions</th>
            <th className="px-4 py-2.5 text-right font-medium">Net Pay</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {Object.entries(byDept).sort((a, b) => b[1].g - a[1].g).map(([dept, d]) => (
              <tr key={dept} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium capitalize">{dept}</td><td className="px-4 py-2.5 text-center">{d.cnt}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(d.g)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-600">-{fmt(d.t)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{fmt(d.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (activeReport === "overtime_report") {
      const withOT = reportData.filter((e) => e.ot_hours > 0).sort((a, b) => b.ot_hours - a.ot_hours);
      return (
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/30 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Employee</th><th className="px-4 py-2.5 text-left font-medium">Department</th>
            <th className="px-4 py-2.5 text-right font-medium">OT Hours</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {withOT.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No overtime this period.</td></tr>
              : withOT.map((e) => <tr key={e.id} className="hover:bg-muted/20"><td className="px-4 py-2.5 font-medium">{e.employee_name}</td><td className="px-4 py-2.5 text-muted-foreground capitalize text-xs">{e.department}</td><td className="px-4 py-2.5 text-right tabular-nums">{e.ot_hours.toFixed(1)} hrs</td></tr>)
            }
          </tbody>
          {withOT.length > 0 && <tfoot><tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm"><td className="px-4 py-2.5" colSpan={2}>Total</td><td className="px-4 py-2.5 text-right">{totals.ot.toFixed(1)} hrs</td></tr></tfoot>}
        </table>
      );
    }
    return null;
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;

  const activeDef = REPORT_DEFS.find((r) => r.key === activeReport);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Payroll Reports</h2>
          <p className="text-muted-foreground text-sm">Export and review payroll data by period</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Period selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Period:</span>
            {periods.slice(0, 8).map((p) => (
              <button key={p.id} onClick={() => setSelectedPeriod(p)} className={cn("rounded-full px-3 py-1 text-xs font-medium border transition-colors", selectedPeriod?.id === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted")}>
                {p.label ?? runNo(p.period_year, p.period_month)}
              </button>
            ))}
          </div>
          <Button onClick={exportCSV} disabled={reportData.length === 0} variant="outline" size="sm" className="gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />

        {/* Report type tabs */}
        <div className="flex gap-1 border-b border-border px-4 pt-3 flex-wrap">
          {REPORT_DEFS.map((def) => {
            const Icon = def.icon;
            return (
              <button
                key={def.key}
                onClick={() => setActiveReport(def.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeReport === def.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {def.label}
              </button>
            );
          })}
        </div>

        {/* Report summary */}
        <div className="flex items-center justify-between px-4 pt-3 pb-3 flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold">{activeDef?.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{selectedPeriod?.label ?? "—"} · {reportData.length} employees · {activeDef?.userAccess}</p>
          </div>
          {reportData.length > 0 && (
            <p className="text-xs text-muted-foreground">Net: <span className="font-semibold text-emerald-600">{fmt(totals.net)}</span></p>
          )}
        </div>

        <div className="overflow-x-auto"><ReportTable /></div>
      </div>

      <Card className="border-dashed">
        <CardContent className="py-4 flex items-center gap-3 text-sm text-muted-foreground">
          <ClipboardList className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">More reports coming</p>
            <p className="text-xs">Payroll Cost by Project, by WBS, Salary Change Report, and full Payroll Audit Report will be added once cost allocation is complete.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
