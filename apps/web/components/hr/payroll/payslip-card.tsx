"use client";

import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Printer, CheckCircle2, Clock, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PayslipLine {
  name: string;
  category: string; // earning | deduction | employer_contribution
  amount: number;
  note?: string;
}

interface PayslipData {
  period_label: string;
  period_start: string;
  period_end: string;
  employee_code?: string;
  full_name: string;
  department: string;
  job_title: string;
  payment_method?: string;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  working_days: number;
  present_days: number;
  leave_days: number;
  ot_hours: number;
  // Tax relief (shown in KHR)
  tax_relief_khr?: number;
  taxable_income?: number;
  total_tos?: number;
  total_nssf_ee?: number;
  total_nssf_er?: number;
  exchange_rate?: number;
  // Payroll status
  payroll_status?: string;
  bank_name?: string;
  bank_account?: string;  // masked last 4
  lines: PayslipLine[];
}

interface Props {
  data: PayslipData;
  companyName?: string;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtKHR(n: number) {
  return n.toLocaleString("km-KH");
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  paid:     { label: "Paid",           icon: CheckCircle2, color: "text-emerald-700" },
  approved: { label: "Approved",       icon: CheckCircle2, color: "text-emerald-700" },
  locked:   { label: "Locked",         icon: Lock,         color: "text-orange-700" },
  exported: { label: "Exported",       icon: Lock,         color: "text-orange-700" },
  draft:    { label: "Draft",          icon: Clock,        color: "text-muted-foreground" },
  reviewed: { label: "HR Reviewed",    icon: Clock,        color: "text-blue-700" },
};

export function PayslipCard({ data, companyName = "DCOS Construction" }: Props) {
  const earnings              = data.lines.filter((l) => l.category === "earning");
  const deductions            = data.lines.filter((l) => l.category === "deduction");
  const employerContributions = data.lines.filter((l) => l.category === "employer_contribution");

  const statusCfg = data.payroll_status ? STATUS_CONFIG[data.payroll_status] : null;

  return (
    <div>
      {/* Print button (hidden in print) */}
      <div className="flex justify-end mb-4 print:hidden">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      {/* Payslip document */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden print:shadow-none print:border-gray-300">

        {/* Header */}
        <div className="bg-slate-800 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">{companyName}</h2>
              <p className="text-slate-300 text-xs mt-0.5">Payslip — {data.period_label}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Pay Period</p>
              <p className="text-sm font-medium">
                {format(new Date(data.period_start), "d MMM")} – {format(new Date(data.period_end), "d MMM yyyy")}
              </p>
              {statusCfg && (
                <div className={cn("mt-1 flex items-center justify-end gap-1 text-xs", statusCfg.color)}>
                  <statusCfg.icon className="h-3.5 w-3.5" />
                  {statusCfg.label}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Employee information */}
        <div className="px-6 py-4 bg-slate-50 border-b border-border">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Employee</p>
              <p className="text-sm font-semibold">{data.full_name}</p>
              {data.employee_code && <p className="text-xs text-muted-foreground">{data.employee_code}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="text-sm capitalize">{data.department}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Position</p>
              <p className="text-sm">{data.job_title || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Working Days</p>
              <p className="text-sm">{data.working_days}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Days Present</p>
              <p className="text-sm">{data.present_days}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Payment Method</p>
              <p className="text-sm capitalize">{data.payment_method?.replace(/_/g, " ") ?? "Bank Transfer"}</p>
            </div>
          </div>
        </div>

        {/* Earnings */}
        <div className="px-6 py-4 border-b border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Earnings</h4>
          <div className="space-y-2">
            {earnings.map((line, i) => (
              <div key={i} className="flex items-start justify-between text-sm">
                <div>
                  <span>{line.name}</span>
                  {line.note && <p className="text-[10px] text-muted-foreground">{line.note}</p>}
                </div>
                <span className="font-medium tabular-nums ml-4">${fmt(line.amount)}</span>
              </div>
            ))}
            {earnings.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-border flex items-center justify-between text-sm font-semibold">
            <span>Gross Earnings</span>
            <span>${fmt(data.gross_salary)}</span>
          </div>
        </div>

        {/* Tax Relief (shown in KHR) */}
        {(data.tax_relief_khr ?? 0) > 0 && (
          <div className="px-6 py-4 border-b border-border bg-emerald-50/30">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-3">Tax Relief (KHR)</h4>
            <div className="space-y-1.5 text-sm">
              {(data.tax_relief_khr ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Total Dependent Relief</span>
                  <span className="tabular-nums">{fmtKHR(data.tax_relief_khr ?? 0)} KHR</span>
                </div>
              )}
              {data.exchange_rate && (
                <p className="text-xs text-muted-foreground">Exchange rate: {data.exchange_rate.toLocaleString()} KHR/USD</p>
              )}
              {data.taxable_income !== undefined && (
                <div className="flex justify-between text-sm pt-1 border-t border-emerald-200">
                  <span className="text-emerald-700 font-medium">Taxable Income (after relief)</span>
                  <span className="tabular-nums font-medium">${fmt(data.taxable_income)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deductions */}
        <div className="px-6 py-4 border-b border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Deductions</h4>
          <div className="space-y-2">
            {deductions.map((line, i) => (
              <div key={i} className="flex items-start justify-between text-sm">
                <div>
                  <span>{line.name}</span>
                  {line.note && <p className="text-[10px] text-muted-foreground">{line.note}</p>}
                </div>
                <span className="font-medium tabular-nums text-red-600 ml-4">-${fmt(line.amount)}</span>
              </div>
            ))}
            {/* Show TOS and NSSF from aggregate fields if entry lines are missing */}
            {deductions.length === 0 && (
              <>
                {(data.total_tos ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Tax on Salary (TOS)</span>
                    <span className="text-red-600 tabular-nums">-${fmt(data.total_tos ?? 0)}</span>
                  </div>
                )}
                {(data.total_nssf_ee ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>NSSF Employee</span>
                    <span className="text-red-600 tabular-nums">-${fmt(data.total_nssf_ee ?? 0)}</span>
                  </div>
                )}
                {deductions.length === 0 && !data.total_tos && !data.total_nssf_ee && (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-dashed border-border flex items-center justify-between text-sm font-semibold">
            <span>Total Deductions</span>
            <span className="text-red-600">-${fmt(data.total_deductions)}</span>
          </div>
        </div>

        {/* Employer Contributions (info only, not deducted from employee) */}
        {(employerContributions.length > 0 || (data.total_nssf_er ?? 0) > 0) && (
          <div className="px-6 py-4 border-b border-border bg-amber-50/30">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3">Employer Contributions (for information)</h4>
            <div className="space-y-1.5 text-sm">
              {employerContributions.map((line, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">{line.name}</span>
                  <span className="tabular-nums text-amber-700">${fmt(line.amount)}</span>
                </div>
              ))}
              {employerContributions.length === 0 && (data.total_nssf_er ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NSSF Employer Share</span>
                  <span className="tabular-nums text-amber-700">${fmt(data.total_nssf_er ?? 0)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Net pay */}
        <div className="px-6 py-5 bg-emerald-50 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Net Pay</p>
              {data.bank_name && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.bank_name}{data.bank_account ? ` · ****${data.bank_account}` : ""}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                = Gross ${fmt(data.gross_salary)} − Deductions ${fmt(data.total_deductions)}
              </p>
            </div>
            <p className="text-3xl font-bold text-emerald-700">${fmt(data.net_salary)}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-border text-[10px] text-muted-foreground flex justify-between">
          <span>Generated by DCOS Payroll System</span>
          <span>{data.period_label}</span>
        </div>
      </div>
    </div>
  );
}
