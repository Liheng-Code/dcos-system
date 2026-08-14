"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ScrollText } from "lucide-react";
import { PayslipCard } from "@/components/hr/payroll/payslip-card";

interface Period {
  id: string;
  label: string;
  period_year: number;
  period_month: number;
  start_date: string;
  end_date: string;
}

interface EntryLine {
  amount: number;
  note: string | null;
  payroll_component_types: { name: string; category: string };
}

interface Entry {
  id: string;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  working_days: number;
  present_days: number;
  leave_days: number;
  ot_hours: number;
  total_tos: number;
  total_nssf_ee: number;
  total_nssf_er: number;
  tax_relief_khr: number;
  taxable_income: number;
  exchange_rate: number;
  status: string;
  payroll_entry_lines: EntryLine[];
}

interface Profile {
  full_name: string;
  department: string;
  job_title: string;
}

interface BankAccount {
  bank_name: string;
  account_number: string;
}

function MyPayslipInner() {
  const searchParams = useSearchParams();
  const preselectedEntryId = searchParams.get("entry");

  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      const uid = data.user.id;
      setCurrentUserId(uid);

      const [profRes, bankRes, periodsRes] = await Promise.all([
        supabase.from("profiles").select("full_name, department, job_title").eq("id", uid).single(),
        supabase.from("employee_bank_accounts").select("bank_name, account_number").eq("employee_id", uid).eq("is_primary", true).maybeSingle(),
        supabase.from("payroll_periods")
          .select("id, label, period_year, period_month, start_date, end_date")
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false }),
      ]);

      setProfile(profRes.data as Profile | null);
      setBank(bankRes.data as BankAccount | null);

      // Only show periods where user has a non-draft entry
      const allPeriods = (periodsRes.data || []) as Period[];
      const entryRes = await supabase
        .from("payroll_entries")
        .select("period_id")
        .eq("employee_id", uid)
        .neq("status", "draft");

      const eligiblePeriodIds = new Set((entryRes.data || []).map((e: { period_id: string }) => e.period_id));
      const visiblePeriods = allPeriods.filter((p) => eligiblePeriodIds.has(p.id));
      setPeriods(visiblePeriods);

      if (visiblePeriods.length > 0) {
        setSelectedPeriodId(visiblePeriods[0].id);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedPeriodId || !currentUserId) return;
    setLoadingEntry(true);
    setEntry(null);
    const supabase = createClient();
    supabase
      .from("payroll_entries")
      .select(`
        id, gross_salary, total_deductions, net_salary,
        working_days, present_days, leave_days, ot_hours,
        total_tos, total_nssf_ee, total_nssf_er,
        tax_relief_khr, taxable_income, exchange_rate, status,
        payroll_entry_lines (
          amount, note,
          payroll_component_types (name, category)
        )
      `)
      .eq("period_id", selectedPeriodId)
      .eq("employee_id", currentUserId)
      .single()
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setEntry(data as any);
        setLoadingEntry(false);
      });
  }, [selectedPeriodId, currentUserId]);

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">My Payslip</h2>
          <p className="text-muted-foreground text-sm">View and download your monthly payslips</p>
        </div>
      </div>

      {periods.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <ScrollText className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No payslips available yet.</p>
          <p className="text-xs text-muted-foreground">Your payslips will appear here once HR has processed your payroll.</p>
        </div>
      ) : (
        <>
          {/* Period selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-muted-foreground">Period:</label>
            <div className="flex gap-2 flex-wrap">
              {periods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPeriodId(p.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    selectedPeriodId === p.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Payslip */}
          {loadingEntry ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : entry && selectedPeriod && profile ? (
            <PayslipCard
              data={{
                period_label: selectedPeriod.label,
                period_start: selectedPeriod.start_date,
                period_end: selectedPeriod.end_date,
                full_name: profile.full_name,
                department: profile.department,
                job_title: profile.job_title,
                gross_salary: entry.gross_salary,
                total_deductions: entry.total_deductions,
                net_salary: entry.net_salary,
                working_days: entry.working_days,
                present_days: entry.present_days,
                leave_days: entry.leave_days,
                ot_hours: entry.ot_hours,
                total_tos: entry.total_tos,
                total_nssf_ee: entry.total_nssf_ee,
                total_nssf_er: entry.total_nssf_er,
                tax_relief_khr: entry.tax_relief_khr,
                taxable_income: entry.taxable_income,
                exchange_rate: entry.exchange_rate,
                payroll_status: entry.status,
                bank_name: bank?.bank_name,
                bank_account: bank?.account_number ? bank.account_number.slice(-4) : undefined,
                lines: entry.payroll_entry_lines.map((l) => ({
                  name: l.payroll_component_types?.name ?? "Unknown",
                  category: l.payroll_component_types?.category ?? "earning",
                  amount: l.amount,
                  note: l.note ?? undefined,
                })),
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-4">No payslip data for this period.</p>
          )}
        </>
      )}
    </div>
  );
}

export default function MyPayslipPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>}>
      <MyPayslipInner />
    </Suspense>
  );
}
