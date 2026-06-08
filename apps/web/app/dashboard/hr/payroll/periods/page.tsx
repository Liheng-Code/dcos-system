"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Loader2, X, ChevronRight } from "lucide-react";
import { format, getDaysInMonth } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";

interface Period {
  id: string;
  period_year: number;
  period_month: number;
  label: string;
  start_date: string;
  end_date: string;
  cutoff_date: string | null;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  open:       "bg-blue-100 text-blue-700",
  processing: "bg-amber-100 text-amber-700",
  approved:   "bg-emerald-100 text-emerald-700",
  paid:       "bg-green-100 text-green-800",
  closed:     "bg-gray-100 text-gray-500",
};

const STATUS_NEXT: Record<string, string> = {
  open:       "processing",
  processing: "approved",
  approved:   "paid",
  paid:       "closed",
};

const STATUS_ACTION: Record<string, string> = {
  open:       "Mark Processing",
  processing: "Approve",
  approved:   "Mark Paid",
  paid:       "Close",
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function PayrollPeriodsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    cutoff: "",
  });

  function load() {
    const supabase = createClient();
    supabase
      .from("payroll_periods")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .then(({ data }) => {
        setPeriods((data || []) as Period[]);
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const daysInMonth = getDaysInMonth(new Date(form.year, form.month - 1));
    const start = `${form.year}-${String(form.month).padStart(2, "0")}-01`;
    const end   = `${form.year}-${String(form.month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const label = `${MONTHS[form.month - 1]} ${form.year}`;

    const { error } = await supabase.from("payroll_periods").insert({
      period_year:  form.year,
      period_month: form.month,
      label,
      start_date:  start,
      end_date:    end,
      cutoff_date: form.cutoff || null,
      status:      "open",
      created_by:  user?.id,
    });

    if (error) {
      toast.error(error.message.includes("unique") ? "Period already exists for that month" : "Failed to create period");
    } else {
      toast.success(`${label} period created`);
      setShowCreate(false);
      load();
    }
    setCreating(false);
  }

  async function advanceStatus(period: Period) {
    const next = STATUS_NEXT[period.status];
    if (!next) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const update: Record<string, string | null> = { status: next };
    if (next === "approved") {
      update.approved_by = user?.id ?? null;
      update.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from("payroll_periods").update(update).eq("id", period.id);
    if (error) toast.error("Failed to update period status");
    else {
      toast.success(`Period moved to ${next}`);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payroll Periods</h2>
          <p className="text-muted-foreground text-sm">Manage monthly payroll periods and their status</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Create Period
        </Button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl shadow-xl w-80 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Create Payroll Period</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Year</label>
                <Input
                  type="number"
                  min="2020" max="2099"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value) || f.year }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Month</label>
                <select
                  value={form.month}
                  onChange={(e) => setForm((f) => ({ ...f, month: parseInt(e.target.value) }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Cutoff Date (optional)</label>
                <Input
                  type="date"
                  value={form.cutoff}
                  onChange={(e) => setForm((f) => ({ ...f, cutoff: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">All Periods ({periods.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : periods.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payroll periods yet. Create one to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Period</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date Range</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Cutoff</th>
                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {periods.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {format(new Date(p.start_date), "d MMM")} – {format(new Date(p.end_date), "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.cutoff_date ? format(new Date(p.cutoff_date), "d MMM yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize", STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-500")}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {p.status === "open" && (
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                              <Link href={`/dashboard/hr/payroll/run?period=${p.id}`}>
                                Run <ChevronRight className="h-3 w-3" />
                              </Link>
                            </Button>
                          )}
                          {STATUS_NEXT[p.status] && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => advanceStatus(p)}
                            >
                              {STATUS_ACTION[p.status]}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
