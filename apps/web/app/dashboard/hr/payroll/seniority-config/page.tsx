"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Save, Info, Plus, Award } from "lucide-react";

interface SeniorityRuleRow {
  id?: string;
  days_per_payment: number;
  payment_months: number[];
  min_service_months: number;
  effective_date: string;
  status: string;
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-gray-200 bg-gray-50 text-gray-600",
  archived: "border-slate-200 bg-slate-100 text-slate-500",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function SeniorityConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<SeniorityRuleRow[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("payroll_seniority_rules").select("*").order("effective_date", { ascending: false })
      .then(({ data }) => {
        setRules((data ?? []) as SeniorityRuleRow[]);
        setLoading(false);
      });
  }, []);

  function updateRule(idx: number, field: keyof SeniorityRuleRow, value: unknown) {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function toggleMonth(idx: number, month: number) {
    setRules((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const months = r.payment_months.includes(month)
        ? r.payment_months.filter((m) => m !== month)
        : [...r.payment_months, month].sort((a, b) => a - b);
      return { ...r, payment_months: months };
    }));
  }

  function addRule() {
    setRules((prev) => [
      { days_per_payment: 7.5, payment_months: [6, 12], min_service_months: 1, effective_date: new Date().toISOString().slice(0, 10), status: "draft", notes: null },
      ...prev,
    ]);
  }

  async function saveRules() {
    setSaving(true);
    const supabase = createClient();
    for (const rule of rules) {
      if (rule.payment_months.length === 0) {
        toast.error("Each rule needs at least one payment month");
        setSaving(false);
        return;
      }
      const payload = {
        days_per_payment: rule.days_per_payment,
        payment_months: rule.payment_months,
        min_service_months: rule.min_service_months,
        effective_date: rule.effective_date,
        status: rule.status,
        notes: rule.notes,
      };
      if (rule.id) {
        const { error } = await supabase.from("payroll_seniority_rules").update(payload).eq("id", rule.id);
        if (error) { toast.error(error.message); setSaving(false); return; }
      } else {
        const { error, data } = await supabase.from("payroll_seniority_rules").insert(payload).select("id").single();
        if (error) { toast.error(error.message); setSaving(false); return; }
        if (data) setRules((prev) => prev.map((r) => (r === rule ? { ...r, id: data.id } : r)));
      }
    }
    toast.success("Seniority rules saved");
    setSaving(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  const active = rules.find((r) => r.status === "active");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Seniority Payment Configuration</h2>
          <p className="text-muted-foreground text-sm">Cambodia twice-yearly seniority payment (Prakas 443: 7.5 days of wages every June and December)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={addRule} variant="outline" size="sm" className="gap-1"><Plus className="h-4 w-4" /> New Rule</Button>
          <Button onClick={saveRules} disabled={saving} size="sm" className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </div>
      </div>

      {active && (
        <Card className="border-violet-200 bg-violet-50/30">
          <CardContent className="py-4 flex items-center gap-3">
            <Award className="h-8 w-8 text-violet-600 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-violet-800">
                Active rule: {active.days_per_payment} days of wages, paid in {active.payment_months.map((m) => MONTH_NAMES[m - 1]).join(" & ")}
              </p>
              <p className="text-xs text-violet-700">
                Employees with at least {active.min_service_months} month{active.min_service_months > 1 ? "s" : ""} of service qualify.
                Seniority payments are exempt from Tax on Salary.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Rules</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-right font-medium">Days / Payment</th>
                  <th className="px-4 py-2.5 text-left font-medium">Payment Months</th>
                  <th className="px-4 py-2.5 text-right font-medium">Min Service (months)</th>
                  <th className="px-4 py-2.5 text-left font-medium">Effective Date</th>
                  <th className="px-4 py-2.5 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((rule, idx) => (
                  <tr key={rule.id ?? `new-${idx}`} className="hover:bg-muted/20 align-top">
                    <td className="px-4 py-3 text-right">
                      <Input
                        type="number"
                        step="0.5"
                        min={0}
                        value={rule.days_per_payment}
                        onChange={(e) => updateRule(idx, "days_per_payment", Number(e.target.value))}
                        className="h-8 w-20 text-right inline-block"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {MONTH_NAMES.map((name, mIdx) => {
                          const month = mIdx + 1;
                          const on = rule.payment_months.includes(month);
                          return (
                            <button
                              key={month}
                              type="button"
                              onClick={() => toggleMonth(idx, month)}
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium border transition-colors",
                                on ? "border-violet-300 bg-violet-100 text-violet-700" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Input
                        type="number"
                        min={0}
                        value={rule.min_service_months}
                        onChange={(e) => updateRule(idx, "min_service_months", Number(e.target.value))}
                        className="h-8 w-20 text-right inline-block"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="date"
                        value={rule.effective_date}
                        onChange={(e) => updateRule(idx, "effective_date", e.target.value)}
                        className="h-8 w-36"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={rule.status}
                        onChange={(e) => updateRule(idx, "status", e.target.value)}
                        className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", STATUS_COLORS[rule.status] ?? STATUS_COLORS.draft)}
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No rules yet — add one to enable seniority payments.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          The payroll engine pays <strong>days × daily rate</strong> (basic salary ÷ working days per month) to every employee whose
          service exceeds the minimum, in each selected payment month. Only one rule should be <strong>active</strong> at a time —
          the engine uses the active rule with the latest effective date. Changing rules does not affect locked payroll periods.
        </p>
      </div>
    </div>
  );
}
