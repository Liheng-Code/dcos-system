"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Download, FileText, BarChart2, Receipt, Shield, Clock, ClipboardList, CalendarClock, Info } from "lucide-react";
import {
  buildEnterprisePayrollLedgerCsv,
  buildGdtTosReturnCsv,
  buildNssfD03Csv,
  downloadCsv,
} from "@/components/hr/payroll/payroll-helpers";

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

type ReportType = "payroll_register" | "tos_report" | "nssf_report" | "department_cost" | "overtime_report" | "compliance";

const REPORT_DEFS: { key: ReportType; label: string; description: string; icon: typeof FileText; userAccess: string }[] = [
  { key: "payroll_register", label: "Payroll Register",     description: "All employees with full salary breakdown", icon: FileText,  userAccess: "HR / Finance" },
  { key: "tos_report",       label: "Tax on Salary Report", description: "TOS per employee with effective rate",     icon: Receipt,   userAccess: "HR / Finance" },
  { key: "nssf_report",      label: "NSSF Report",          description: "Employee and employer NSSF contributions", icon: Shield,    userAccess: "HR / Finance" },
  { key: "department_cost",  label: "Cost by Department",   description: "Summarized payroll cost per department",   icon: BarChart2, userAccess: "Management" },
  { key: "overtime_report",  label: "Overtime Report",      description: "OT hours per employee",                    icon: Clock,     userAccess: "HR / Manager" },
  { key: "compliance",       label: "Compliance Exports",   description: "LACMS, GDT and NSSF filing-ready exports", icon: CalendarClock, userAccess: "HR / Finance" },
];

/** Next LACMS/GDT/NSSF filing deadlines for a given payroll period's month. */
function filingDeadlines(periodYear: number, periodMonth: number) {
  const nextMonthDate = new Date(periodYear, periodMonth, 1); // periodMonth is 1-indexed, so this rolls to the next month
  const y = nextMonthDate.getFullYear();
  const m = nextMonthDate.getMonth(); // 0-indexed
  const fmtDate = (day: number) => new Date(y, m, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return [
    { label: "NSSF Form D03", date: fmtDate(15) },
    { label: "GDT Tax on Salary Return", date: fmtDate(20) },
    { label: "MLVT Payroll Book (LACMS)", date: fmtDate(20) },
  ];
}

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

interface ComplianceEntry {
  full_name: string;
  department: string;
  gross_salary: number;
  tax_relief_khr: number;
  taxable_income: number;
  total_tos: number;
  total_nssf_ee: number;
  total_nssf_er: number;
  exchange_rate: number;
  working_days: number;
  present_days: number;
  basic_wage: number;
  ot_150_pay: number;
  ot_200_pay: number;
  ot_holiday_pay: number;
  other_components: number;
  wage_base: number;
}

function ReportTable({
  activeReport,
  reportData,
  loadingReport,
  totals,
}: {
  activeReport: ReportType;
  reportData: ReportEntry[];
  loadingReport: boolean;
  totals: { gross: number; tos: number; ee: number; er: number; net: number; ot: number };
}) {
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

function ComplianceExportsPanel({
  selectedPeriod,
  loadingCompliance,
  complianceData,
  onExportLedger,
  onExportTos,
  onExportNssf,
}: {
  selectedPeriod: Period | null;
  loadingCompliance: boolean;
  complianceData: ComplianceEntry[];
  onExportLedger: () => void;
  onExportTos: () => void;
  onExportNssf: () => void;
}) {
  if (!selectedPeriod) return null;
  if (loadingCompliance) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const deadlines = filingDeadlines(selectedPeriod.period_year, selectedPeriod.period_month);

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 flex items-start gap-2 text-xs text-amber-800">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          These are data exports for manual upload/re-entry into the LACMS, GDT, and NSSF portals — none of them expose a public API, so DCOS cannot file directly.
          Column mappings follow published guidance, not the actual government template files, and &quot;weekly holiday pay&quot; is left blank (not calculated — see the compliance plan doc).
          Verify against the official templates before relying on these for a live filing.
        </p>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" /> Next filing deadlines for {selectedPeriod.label}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          {deadlines.map((d) => (
            <div key={d.label} className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">{d.label}</p>
              <p className="font-semibold">{d.date}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-4 space-y-2">
          <p className="text-sm font-semibold">MLVT Payroll Ledger</p>
          <p className="text-xs text-muted-foreground">Basic wage, working days, OT by type, other components — for LACMS upload.</p>
          <Button onClick={onExportLedger} disabled={complianceData.length === 0} size="sm" variant="outline" className="gap-1.5 w-full">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-2">
          <p className="text-sm font-semibold">GDT Tax on Salary Return</p>
          <p className="text-xs text-muted-foreground">Taxable income and TOS withheld per employee, for the monthly GDT return.</p>
          <Button onClick={onExportTos} disabled={complianceData.length === 0} size="sm" variant="outline" className="gap-1.5 w-full">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-2">
          <p className="text-sm font-semibold">NSSF Form D03</p>
          <p className="text-xs text-muted-foreground">Employee/employer contributions and capped wage base, for the NSSF declaration.</p>
          <Button onClick={onExportNssf} disabled={complianceData.length === 0} size="sm" variant="outline" className="gap-1.5 w-full">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {complianceData.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No payroll entries for this period yet.</p>
      )}
    </div>
  );
}

export default function PayrollReportsPage() {
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [activeReport, setActiveReport] = useState<ReportType>("payroll_register");
  const [reportData, setReportData] = useState<ReportEntry[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [complianceData, setComplianceData] = useState<ComplianceEntry[]>([]);
  const [loadingCompliance, setLoadingCompliance] = useState(false);

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
    window.setTimeout(() => setLoadingReport(true), 0);
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

  useEffect(() => {
    if (!selectedPeriod || activeReport !== "compliance") return;
    window.setTimeout(() => setLoadingCompliance(true), 0);
    const supabase = createClient();

    (async () => {
      const [entriesRes, nssfRulesRes] = await Promise.all([
        supabase.from("payroll_entries")
          .select("id, gross_salary, total_tos, total_nssf_ee, total_nssf_er, tax_relief_khr, taxable_income, exchange_rate, working_days, present_days, profiles!employee_id(full_name, department)")
          .eq("period_id", selectedPeriod.id)
          .order("gross_salary", { ascending: false }),
        supabase.from("nssf_rules")
          .select("max_wage_base, apply_cap")
          .eq("status", "active")
          .eq("apply_cap", true),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries = (entriesRes.data ?? []) as any[];
      const entryIds = entries.map((e) => e.id as string);

      const linesRes = entryIds.length > 0
        ? await supabase.from("payroll_entry_lines")
            .select("entry_id, amount, payroll_component_types(code)")
            .in("entry_id", entryIds)
        : { data: [] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lines = (linesRes.data ?? []) as any[];
      const linesByEntry: Record<string, typeof lines> = {};
      for (const l of lines) {
        if (!linesByEntry[l.entry_id]) linesByEntry[l.entry_id] = [];
        linesByEntry[l.entry_id].push(l);
      }

      // Most conservative (lowest) active capped wage base, if any NSSF rule applies a cap.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nssfCaps = ((nssfRulesRes.data ?? []) as any[]).map((r) => Number(r.max_wage_base)).filter((n) => n > 0);
      const nssfCap = nssfCaps.length > 0 ? Math.min(...nssfCaps) : null;

      const rows: ComplianceEntry[] = entries.map((e) => {
        const entryLines = linesByEntry[e.id] ?? [];
        const sumByCode = (code: string) =>
          entryLines.filter((l) => l.payroll_component_types?.code === code).reduce((s, l) => s + Number(l.amount), 0);
        const basicWage = sumByCode("BASIC");
        const ot150Pay = sumByCode("OT_150");
        const ot200Pay = sumByCode("OT_200");
        const otHolidayPay = sumByCode("OT_HOLIDAY");
        const otherComponents = entryLines
          .filter((l) => !["BASIC", "OT_150", "OT_200", "OT_HOLIDAY"].includes(l.payroll_component_types?.code))
          .reduce((s, l) => s + Number(l.amount), 0);
        const grossSalary = Number(e.gross_salary);

        return {
          full_name: e.profiles?.full_name ?? "—",
          department: e.profiles?.department ?? "—",
          gross_salary: grossSalary,
          tax_relief_khr: Number(e.tax_relief_khr ?? 0),
          taxable_income: Number(e.taxable_income ?? 0),
          total_tos: Number(e.total_tos ?? 0),
          total_nssf_ee: Number(e.total_nssf_ee ?? 0),
          total_nssf_er: Number(e.total_nssf_er ?? 0),
          exchange_rate: Number(e.exchange_rate ?? 0),
          working_days: Number(e.working_days ?? 0),
          present_days: Number(e.present_days ?? 0),
          basic_wage: basicWage,
          ot_150_pay: ot150Pay,
          ot_200_pay: ot200Pay,
          ot_holiday_pay: otHolidayPay,
          other_components: otherComponents,
          wage_base: nssfCap != null ? Math.min(grossSalary, nssfCap) : grossSalary,
        };
      });

      setComplianceData(rows);
      setLoadingCompliance(false);
    })();
  }, [selectedPeriod, activeReport]);

  function exportLedgerCSV() {
    if (!selectedPeriod || complianceData.length === 0) return;
    const label = selectedPeriod.label ?? runNo(selectedPeriod.period_year, selectedPeriod.period_month);
    downloadCsv(`${runNo(selectedPeriod.period_year, selectedPeriod.period_month)}-mlvt-payroll-ledger.csv`, buildEnterprisePayrollLedgerCsv(label, complianceData));
  }
  function exportTosCSV() {
    if (!selectedPeriod || complianceData.length === 0) return;
    const label = selectedPeriod.label ?? runNo(selectedPeriod.period_year, selectedPeriod.period_month);
    downloadCsv(`${runNo(selectedPeriod.period_year, selectedPeriod.period_month)}-gdt-tos-return.csv`, buildGdtTosReturnCsv(label, complianceData));
  }
  function exportNssfCSV() {
    if (!selectedPeriod || complianceData.length === 0) return;
    const label = selectedPeriod.label ?? runNo(selectedPeriod.period_year, selectedPeriod.period_month);
    const rows = complianceData.map((e) => ({ full_name: e.full_name, wage_base: e.wage_base, nssf_ee: e.total_nssf_ee, nssf_er: e.total_nssf_er }));
    downloadCsv(`${runNo(selectedPeriod.period_year, selectedPeriod.period_month)}-nssf-d03.csv`, buildNssfD03Csv(label, rows));
  }

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
          {activeReport !== "compliance" && (
            <Button onClick={exportCSV} disabled={reportData.length === 0} variant="outline" size="sm" className="gap-1.5">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
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
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedPeriod?.label ?? "—"} · {activeReport === "compliance" ? complianceData.length : reportData.length} employees · {activeDef?.userAccess}
            </p>
          </div>
          {activeReport !== "compliance" && reportData.length > 0 && (
            <p className="text-xs text-muted-foreground">Net: <span className="font-semibold text-emerald-600">{fmt(totals.net)}</span></p>
          )}
        </div>

        {activeReport === "compliance" ? (
          <ComplianceExportsPanel
            selectedPeriod={selectedPeriod}
            loadingCompliance={loadingCompliance}
            complianceData={complianceData}
            onExportLedger={exportLedgerCSV}
            onExportTos={exportTosCSV}
            onExportNssf={exportNssfCSV}
          />
        ) : (
          <div className="overflow-x-auto">
            <ReportTable activeReport={activeReport} reportData={reportData} loadingReport={loadingReport} totals={totals} />
          </div>
        )}
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
