"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Settings2,
  DollarSign,
  Receipt,
  Shield,
  Award,
  PieChart,
  ChevronRight,
  Clock,
  Percent,
} from "lucide-react";
import { listPayrollSettingsWithKeyWorkingTimeOtMultipliers, upsertPayrollSettings } from "@/lib/hr/hr-queries";

// ─── Config hub links (existing pages — logic lives there, not here) ─────────

const CONFIG_LINKS = [
  {
    href: "/dashboard/hr/payroll/setup",
    label: "Salary Setup",
    description: "Configure base salary and allowances per employee",
    icon: DollarSign,
  },
  {
    href: "/dashboard/hr/payroll/tax-config",
    label: "Tax Config (TOS)",
    description: "Cambodia Tax on Salary brackets and dependent relief",
    icon: Receipt,
  },
  {
    href: "/dashboard/hr/payroll/nssf-config",
    label: "NSSF Config",
    description: "NSSF contribution rules and rates",
    icon: Shield,
  },
  {
    href: "/dashboard/hr/payroll/seniority-config",
    label: "Seniority Config",
    description: "Cambodia seniority payment rules (twice-yearly)",
    icon: Award,
  },
  {
    href: "/dashboard/hr/payroll/cost-allocation",
    label: "Cost Allocation",
    description: "Allocate payroll cost to projects and WBS",
    icon: PieChart,
  },
];

// ─── payroll_settings shape (see supabase/migrations/20260618000004_payroll_enhancements.sql) ─

interface WorkingTimeValue {
  days_per_month?: number;
  hours_per_day?: number;
}

interface OtMultipliersValue {
  ot150?: number;
  ot200?: number;
  holiday?: number;
}

const DEFAULT_WORKING_TIME = { days_per_month: "26", hours_per_day: "8" };
const DEFAULT_OT_MULTIPLIERS = { ot150: "1.5", ot200: "2.0", holiday: "2.0" };

export default function PayrollConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingTime, setWorkingTime] = useState(DEFAULT_WORKING_TIME);
  const [otMultipliers, setOtMultipliers] = useState(DEFAULT_OT_MULTIPLIERS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    listPayrollSettingsWithKeyWorkingTimeOtMultipliers()
      .then(({ data }) => {
        const rows = (data ?? []) as { key: string; value: WorkingTimeValue | OtMultipliersValue }[];
        const wt = rows.find((r) => r.key === "working_time")?.value as WorkingTimeValue | undefined;
        const ot = rows.find((r) => r.key === "ot_multipliers")?.value as OtMultipliersValue | undefined;
        if (wt) {
          setWorkingTime({
            days_per_month: String(wt.days_per_month ?? 26),
            hours_per_day: String(wt.hours_per_day ?? 8),
          });
        }
        if (ot) {
          setOtMultipliers({
            ot150: String(ot.ot150 ?? 1.5),
            ot200: String(ot.ot200 ?? 2.0),
            holiday: String(ot.holiday ?? 2.0),
          });
        }
        setLoading(false);
      });
  }, []);

  async function saveSettings() {
    setError(null);

    const daysPerMonth = Number(workingTime.days_per_month);
    const hoursPerDay = Number(workingTime.hours_per_day);
    const ot150 = Number(otMultipliers.ot150);
    const ot200 = Number(otMultipliers.ot200);
    const holiday = Number(otMultipliers.holiday);

    if (!Number.isFinite(daysPerMonth) || daysPerMonth < 1 || daysPerMonth > 31) {
      setError("Standard working days per month must be between 1 and 31.");
      return;
    }
    if (!Number.isFinite(hoursPerDay) || hoursPerDay < 1 || hoursPerDay > 24) {
      setError("Standard working hours per day must be between 1 and 24.");
      return;
    }
    if (![ot150, ot200, holiday].every((v) => Number.isFinite(v) && v > 0)) {
      setError("OT multipliers must be positive numbers.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    const { error: upsertError } = await upsertPayrollSettings([
        {
          key: "working_time",
          value: { days_per_month: daysPerMonth, hours_per_day: hoursPerDay },
          updated_by: userData.user?.id,
          updated_at: now,
        },
        {
          key: "ot_multipliers",
          value: { ot150, ot200, holiday },
          updated_by: userData.user?.id,
          updated_at: now,
        },
      ]);

    if (upsertError) {
      setError(upsertError.message);
    } else {
      toast.success("Payroll settings saved");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Payroll Config</h2>
          <p className="text-muted-foreground text-sm">Salary, tax, NSSF, seniority and cost-allocation configuration</p>
        </div>
      </div>

      {/* Link cards to existing config pages */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CONFIG_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                <CardContent className="flex items-start gap-3 pt-5 pb-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground mt-1" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Inline Payroll Settings section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Payroll Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Clock className="h-3.5 w-3.5" /> Working Time
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-xl">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      Standard working days per month
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={workingTime.days_per_month}
                      onChange={(e) => setWorkingTime((f) => ({ ...f, days_per_month: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Used to derive the hourly rate for overtime (Run Payroll). Defaults to 26.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      Standard working hours per day
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={workingTime.hours_per_day}
                      onChange={(e) => setWorkingTime((f) => ({ ...f, hours_per_day: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Percent className="h-3.5 w-3.5" /> Overtime Multipliers
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-2xl">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">OT 1.5× rate</label>
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      value={otMultipliers.ot150}
                      onChange={(e) => setOtMultipliers((f) => ({ ...f, ot150: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">OT 2.0× rate</label>
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      value={otMultipliers.ot200}
                      onChange={(e) => setOtMultipliers((f) => ({ ...f, ot200: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Holiday OT rate</label>
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      value={otMultipliers.holiday}
                      onChange={(e) => setOtMultipliers((f) => ({ ...f, holiday: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className={cn("text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2")}>{error}</p>
              )}

              <div>
                <Button onClick={saveSettings} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Saving…" : "Save Settings"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
