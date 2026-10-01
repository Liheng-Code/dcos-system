"use client";

import { useEffect, useState, use } from "react";
import { getPayrollEntryById, listPayrollEntryLinesByEntryId } from "@/lib/hr/hr-queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, ChevronLeft, FileText, Users, DollarSign, Award } from "lucide-react";
import Link from "next/link";

interface EntryDetail {
  id: string;
  period_id: string;
  employee_id: string;
  gross_salary: number;
  total_deductions: number;
  employer_contributions: number;
  net_salary: number;
  total_tos: number;
  total_nssf_ee: number;
  total_nssf_er: number;
  total_seniority: number;
  unpaid_leave_days: number;
  unpaid_leave_deduction: number;
  tax_relief_khr: number;
  taxable_income: number;
  exchange_rate: number;
  working_days: number;
  present_days: number;
  leave_days: number;
  ot_hours: number;
  status: string;
  calculated_at: string | null;
  employee_name: string;
  department: string;
  job_title: string;
  period_label: string;
}

interface Line {
  id: string;
  amount: number;
  note: string | null;
  name: string;
  code: string;
  category: string;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  reviewed: "bg-indigo-100 text-indigo-700",
  approved: "bg-emerald-100 text-emerald-700",
  paid: "bg-emerald-100 text-emerald-800",
};

export default function PayrollEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    Promise.all([
      getPayrollEntryById(id),
      listPayrollEntryLinesByEntryId(id),
    ]).then(([eRes, lRes]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = eRes.data as any;
      if (e) {
        const prof = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
        const period = Array.isArray(e.payroll_periods) ? e.payroll_periods[0] : e.payroll_periods;
        setEntry({
          ...e,
          gross_salary: Number(e.gross_salary),
          total_deductions: Number(e.total_deductions),
          net_salary: Number(e.net_salary),
          total_tos: Number(e.total_tos ?? 0),
          total_nssf_ee: Number(e.total_nssf_ee ?? 0),
          total_nssf_er: Number(e.total_nssf_er ?? 0),
          total_seniority: Number(e.total_seniority ?? 0),
          unpaid_leave_days: Number(e.unpaid_leave_days ?? 0),
          unpaid_leave_deduction: Number(e.unpaid_leave_deduction ?? 0),
          tax_relief_khr: Number(e.tax_relief_khr ?? 0),
          taxable_income: Number(e.taxable_income ?? 0),
          exchange_rate: Number(e.exchange_rate ?? 4000),
          employee_name: prof?.full_name ?? "—",
          department: prof?.department ?? "—",
          job_title: prof?.job_title ?? "—",
          period_label: period?.label ?? (period ? `${period.period_year}-${String(period.period_month).padStart(2, "0")}` : "—"),
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLines(((lRes.data ?? []) as any[]).map((l) => {
        const ct = Array.isArray(l.payroll_component_types) ? l.payroll_component_types[0] : l.payroll_component_types;
        return { id: l.id, amount: Number(l.amount), note: l.note, name: ct?.name ?? "—", code: ct?.code ?? "", category: ct?.category ?? "" };
      }));
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }
  if (!entry) {
    return (
      <div className="py-20 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Payroll entry not found, or you do not have access to it.</p>
        <Button asChild size="sm" variant="outline"><Link href="/dashboard/hr/payroll">Back to Payroll</Link></Button>
      </div>
    );
  }

  const earnings = lines.filter((l) => l.category === "earning");
  const deductions = lines.filter((l) => l.category === "deduction");

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="-ml-56">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{entry.employee_name}</h2>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize", STATUS_COLORS[entry.status] ?? "bg-gray-100 text-gray-600")}>
              {entry.status}
            </span>
          </div>
          <p className="text-muted-foreground text-sm capitalize">
            {entry.department} · {entry.job_title} · Payroll {entry.period_label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/hr/payroll?period=${entry.period_id}`}><ChevronLeft className="h-4 w-4 mr-1" />Dashboard</Link>
          </Button>
          <Button asChild size="sm" className="gap-1">
            <Link href={`/dashboard/hr/payroll/my-payslip?entry=${entry.id}`}><FileText className="h-4 w-4" />Payslip</Link>
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Gross", value: fmt(entry.gross_salary), color: "text-foreground" },
          { label: "Deductions", value: fmt(entry.total_deductions), color: "text-red-600" },
          { label: "Net Pay", value: fmt(entry.net_salary), color: "text-emerald-600" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={cn("text-lg font-bold tabular-nums", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attendance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Attendance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Working Days</p><p className="font-semibold">{entry.working_days}</p></div>
          <div><p className="text-xs text-muted-foreground">Present</p><p className="font-semibold">{entry.present_days}</p></div>
          <div><p className="text-xs text-muted-foreground">Leave Days</p><p className="font-semibold">{entry.leave_days}</p></div>
          <div><p className="text-xs text-muted-foreground">Unpaid Leave</p><p className={cn("font-semibold", entry.unpaid_leave_days > 0 && "text-red-600")}>{entry.unpaid_leave_days}</p></div>
          <div><p className="text-xs text-muted-foreground">OT Hours</p><p className="font-semibold">{Number(entry.ot_hours).toFixed(1)}</p></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Earnings */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Earnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {earnings.map((l) => (
              <div key={l.id} className="flex justify-between text-sm">
                <div>
                  <span>{l.name}</span>
                  {l.note && <p className="text-[10px] text-muted-foreground">{l.note}</p>}
                </div>
                <span className="tabular-nums font-medium">{fmt(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-border pt-1.5">
              <span>Gross Total</span><span className="tabular-nums">{fmt(entry.gross_salary)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Deductions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Deductions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {deductions.map((l) => (
              <div key={l.id} className="flex justify-between text-sm">
                <div>
                  <span>{l.name}</span>
                  {l.note && <p className="text-[10px] text-muted-foreground">{l.note}</p>}
                </div>
                <span className="tabular-nums font-medium text-red-600">-{fmt(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-border pt-1.5">
              <span>Total Deductions</span><span className="tabular-nums text-red-600">-{fmt(entry.total_deductions)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Tax */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Tax on Salary (TOS)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {entry.tax_relief_khr > 0 && (
              <div className="flex justify-between text-emerald-600 text-xs"><span>Dependent Relief</span><span>-{entry.tax_relief_khr.toLocaleString()} KHR</span></div>
            )}
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Taxable Income</span><span className="tabular-nums">{fmt(entry.taxable_income)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Exchange Rate</span><span>{entry.exchange_rate.toLocaleString()} KHR/USD</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-1"><span>TOS</span><span className="tabular-nums text-red-600">-{fmt(entry.total_tos)}</span></div>
          </CardContent>
        </Card>

        {/* NSSF */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">NSSF</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Employee</span><span className="tabular-nums text-red-600">-{fmt(entry.total_nssf_ee)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Employer</span><span className="tabular-nums text-amber-600">{fmt(entry.total_nssf_er)}</span></div>
          </CardContent>
        </Card>

        {/* Seniority */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Award className="h-3.5 w-3.5" /> Seniority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {entry.total_seniority > 0 ? (
              <>
                <div className="flex justify-between font-bold"><span>Payment</span><span className="tabular-nums text-violet-600">{fmt(entry.total_seniority)}</span></div>
                <p className="text-[10px] text-muted-foreground">Exempt from TOS (Cambodia Labor Law)</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No seniority payment this period.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
