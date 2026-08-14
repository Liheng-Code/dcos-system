"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Save, Info } from "lucide-react";

interface NSSFRule {
  id?: string;
  contribution_type: string;
  contributor: string;
  rate_percent: number;
  min_wage_base: number | null;
  max_wage_base: number | null;
  apply_cap: boolean;
  effective_date: string;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-gray-200 bg-gray-50 text-gray-600",
  archived: "border-slate-200 bg-slate-100 text-slate-500",
};

const TYPE_LABELS: Record<string, string> = {
  pension: "Pension",
  healthcare: "Healthcare",
  occupational_risk: "Occupational Risk",
};
const CONTRIBUTOR_LABELS: Record<string, string> = {
  employee: "Employee",
  employer: "Employer",
};

export default function NSSFConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<NSSFRule[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("nssf_rules").select("*").order("contribution_type").order("contributor").order("effective_date", { ascending: false })
      .then(({ data }) => {
        setRules((data ?? []) as NSSFRule[]);
        setLoading(false);
      });
  }, []);

  function byType(type: string) {
    return rules.filter((r) => r.contribution_type === type);
  }

  function updateRule(id: string | undefined, idx: number, field: keyof NSSFRule, value: unknown) {
    setRules((prev) => prev.map((r, i) => {
      if (id ? r.id === id : i === idx) return { ...r, [field]: value };
      return r;
    }));
  }

  async function saveRules(type: string) {
    setSaving(true);
    const supabase = createClient();
    const toSave = rules.filter((r) => r.contribution_type === type);
    for (const rule of toSave) {
      const payload = {
        contribution_type: rule.contribution_type,
        contributor: rule.contributor,
        rate_percent: rule.rate_percent,
        min_wage_base: rule.min_wage_base,
        max_wage_base: rule.max_wage_base,
        apply_cap: rule.apply_cap,
        effective_date: rule.effective_date,
        status: rule.status,
      };
      if (rule.id) {
        const { error } = await supabase.from("nssf_rules").update(payload).eq("id", rule.id);
        if (error) { toast.error(error.message); setSaving(false); return; }
      } else {
        const { error, data } = await supabase.from("nssf_rules").insert(payload).select("id").single();
        if (error) { toast.error(error.message); setSaving(false); return; }
        if (data) setRules((prev) => prev.map((r) => r === rule ? { ...r, id: data.id } : r));
      }
    }
    toast.success(`${TYPE_LABELS[type] ?? type} rules saved`);
    setSaving(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  function RuleTable({ type }: { type: string }) {
    const typeRules = byType(type);
    return (
      <div className="space-y-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Contributor</th>
              <th className="px-4 py-2.5 text-right font-medium">Rate %</th>
              <th className="px-4 py-2.5 text-right font-medium">Max Wage Base (USD)</th>
              <th className="px-4 py-2.5 text-center font-medium">Cap Applied</th>
              <th className="px-4 py-2.5 text-left font-medium">Effective Date</th>
              <th className="px-4 py-2.5 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {typeRules.map((rule, idx) => (
              <tr key={rule.id ?? idx} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium">{CONTRIBUTOR_LABELS[rule.contributor] ?? rule.contributor}</td>
                <td className="px-4 py-3 text-right">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={rule.rate_percent}
                    onChange={(e) => updateRule(rule.id, idx, "rate_percent", Number(e.target.value))}
                    className="h-8 w-20 text-right"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Input
                    type="number"
                    step="0.01"
                    value={rule.max_wage_base ?? ""}
                    placeholder="No cap"
                    onChange={(e) => updateRule(rule.id, idx, "max_wage_base", e.target.value ? Number(e.target.value) : null)}
                    className="h-8 w-28 text-right"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={rule.apply_cap}
                    onChange={(e) => updateRule(rule.id, idx, "apply_cap", e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="date"
                    value={rule.effective_date}
                    onChange={(e) => updateRule(rule.id, idx, "effective_date", e.target.value)}
                    className="h-8 w-36"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <select
                    value={rule.status}
                    onChange={(e) => updateRule(rule.id, idx, "status", e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {typeRules.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No {TYPE_LABELS[type]} rules configured.</p>
        )}
        <div className="flex justify-end">
          <Button onClick={() => saveRules(type)} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save {TYPE_LABELS[type]} Rules
          </Button>
        </div>
      </div>
    );
  }

  // Summary card
  const activeRules = rules.filter((r) => r.status === "active");

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h2 className="text-2xl font-bold tracking-tight">NSSF Configuration</h2>
        <p className="text-muted-foreground text-sm">Manage National Social Security Fund contribution rates</p>
      </div>

      {/* Active rules summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["pension", "healthcare", "occupational_risk"] as const).map((type) => {
          const eeRule = activeRules.find((r) => r.contribution_type === type && r.contributor === "employee");
          const erRule = activeRules.find((r) => r.contribution_type === type && r.contributor === "employer");
          return (
            <Card key={type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{TYPE_LABELS[type]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {eeRule && <p className="text-sm">EE: <span className="font-semibold">{eeRule.rate_percent}%</span></p>}
                {erRule && <p className="text-sm">ER: <span className="font-semibold">{erRule.rate_percent}%</span></p>}
                {!eeRule && !erRule && <p className="text-xs text-muted-foreground">Not configured</p>}
                {(eeRule?.apply_cap || erRule?.apply_cap) && (
                  <p className="text-[11px] text-muted-foreground">
                    Cap: ${(eeRule?.max_wage_base ?? erRule?.max_wage_base ?? 0).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        <Card className="border-blue-200 bg-blue-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-blue-700">Total ER Contribution</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-blue-700">
              {activeRules.filter((r) => r.contributor === "employer").reduce((s, r) => s + r.rate_percent, 0).toFixed(2)}%
            </p>
            <p className="text-[11px] text-muted-foreground">of applicable wage</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        Changing active rules does not affect locked payroll runs. Historical payrolls preserve a snapshot of the rules used at calculation time.
      </div>

      <Tabs defaultValue="pension">
        <TabsList className="bg-muted/30 p-1 rounded-lg">
          <TabsTrigger value="pension">Pension</TabsTrigger>
          <TabsTrigger value="healthcare">Healthcare</TabsTrigger>
          <TabsTrigger value="occupational_risk">Occupational Risk</TabsTrigger>
          <TabsTrigger value="history">Rule History</TabsTrigger>
        </TabsList>

        <TabsContent value="pension" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Pension Contribution Rules</CardTitle></CardHeader>
            <CardContent><RuleTable type="pension" /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="healthcare" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Healthcare Contribution Rules</CardTitle></CardHeader>
            <CardContent><RuleTable type="healthcare" /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="occupational_risk" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Occupational Risk Contribution Rules</CardTitle></CardHeader>
            <CardContent><RuleTable type="occupational_risk" /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">All NSSF Rules</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium">Contributor</th>
                    <th className="px-4 py-2.5 text-right font-medium">Rate %</th>
                    <th className="px-4 py-2.5 text-right font-medium">Cap (USD)</th>
                    <th className="px-4 py-2.5 text-left font-medium">Effective Date</th>
                    <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.map((r, i) => (
                    <tr key={r.id ?? i} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{TYPE_LABELS[r.contribution_type] ?? r.contribution_type}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{CONTRIBUTOR_LABELS[r.contributor] ?? r.contributor}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.rate_percent}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.max_wage_base ? `$${r.max_wage_base}` : "—"}</td>
                      <td className="px-4 py-2.5">{r.effective_date}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="outline" className={cn("capitalize text-[10px]", STATUS_COLORS[r.status] ?? "")}>
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rules.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No rules yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
