"use client";

import { useEffect, useState } from "react";
import { listPayrollEntries, listPayrollPeriods } from "@/lib/hr/hr-queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Search, ChevronRight, Filter } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface PayrollRun {
  id: string;
  period_year: number;
  period_month: number;
  label: string | null;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  locked_at: string | null;
  // aggregated from payroll_entries
  employee_count: number;
  total_gross: number;
  total_tos: number;
  total_nssf_ee: number;
  total_nssf_er: number;
  total_net: number;
}

const STATUS_COLORS: Record<string, string> = {
  open: "border-gray-200 bg-gray-50 text-gray-600",
  draft: "border-gray-200 bg-gray-50 text-gray-600",
  calculated: "border-blue-200 bg-blue-50 text-blue-700",
  hr_reviewed: "border-indigo-200 bg-indigo-50 text-indigo-700",
  finance_verified: "border-violet-200 bg-violet-50 text-violet-700",
  director_approved: "border-amber-200 bg-amber-50 text-amber-700",
  locked: "border-orange-200 bg-orange-50 text-orange-700",
  exported: "border-cyan-200 bg-cyan-50 text-cyan-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  processing: "border-blue-200 bg-blue-50 text-blue-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-50 text-slate-600",
};

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function runNo(year: number, month: number) {
  return `PAY-${year}-${String(month).padStart(2, "0")}`;
}

const ALL_STATUSES = [
  "open", "calculated", "hr_reviewed", "finance_verified",
  "director_approved", "locked", "exported", "paid",
];

export default function PayrollRunsPage() {
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {

    // Fetch periods + aggregated entry data
    Promise.all([
      listPayrollPeriods("*"),
      listPayrollEntries(),
    ]).then(([pRes, eRes]) => {
      const periods = (pRes.data ?? []) as Record<string, unknown>[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries = (eRes.data ?? []) as any[];

      // Build aggregation by period_id
      const agg: Record<string, { count: number; gross: number; tos: number; nssf_ee: number; nssf_er: number; net: number }> = {};
      for (const e of entries) {
        const pid = e.period_id as string;
        if (!agg[pid]) agg[pid] = { count: 0, gross: 0, tos: 0, nssf_ee: 0, nssf_er: 0, net: 0 };
        agg[pid].count += 1;
        agg[pid].gross += Number(e.gross_salary) || 0;
        agg[pid].tos   += Number(e.total_tos) || 0;
        agg[pid].nssf_ee += Number(e.total_nssf_ee) || 0;
        agg[pid].nssf_er += Number(e.total_nssf_er) || 0;
        agg[pid].net   += Number(e.net_salary) || 0;
      }

      const runList: PayrollRun[] = periods.map((p) => {
        const a = agg[p.id as string] ?? { count: 0, gross: 0, tos: 0, nssf_ee: 0, nssf_er: 0, net: 0 };
        return {
          id: p.id as string,
          period_year: p.period_year as number,
          period_month: p.period_month as number,
          label: p.label as string | null,
          start_date: p.start_date as string,
          end_date: p.end_date as string,
          status: p.status as string,
          created_at: p.created_at as string,
          approved_at: p.approved_at as string | null,
          locked_at: p.locked_at as string | null,
          employee_count: a.count,
          total_gross: a.gross,
          total_tos: a.tos,
          total_nssf_ee: a.nssf_ee,
          total_nssf_er: a.nssf_er,
          total_net: a.net,
        };
      });

      setRuns(runList);
      setLoading(false);
    });
  }, []);

  const filtered = runs.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const label = r.label ?? runNo(r.period_year, r.period_month);
      if (!label.toLowerCase().includes(q) && !r.status.toLowerCase().includes(q)) return false;
    }
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  const summary = {
    total: runs.length,
    inProgress: runs.filter((r) => !["paid", "closed", "open"].includes(r.status)).length,
    paid: runs.filter((r) => r.status === "paid").length,
    locked: runs.filter((r) => r.status === "locked").length,
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Payroll Runs</h2>
          <p className="text-muted-foreground text-sm">All monthly payroll processing cycles</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/hr/payroll/periods">Manage Periods</Link>
          </Button>
          <Button asChild size="sm" className="gap-1">
            <Link href="/dashboard/hr/payroll/run"><Plus className="h-4 w-4" />Run Payroll</Link>
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total Runs", value: summary.total },
          { label: "In Progress", value: summary.inProgress, color: "text-blue-600" },
          { label: "Locked", value: summary.locked, color: "text-orange-600" },
          { label: "Paid", value: summary.paid, color: "text-emerald-600" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-medium">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by period or status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        {(search || statusFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); }}>Clear</Button>
        )}
      </div>

      {/* Runs table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Payroll Runs ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Run No.</th>
                  <th className="px-4 py-2.5 text-left font-medium">Period</th>
                  <th className="px-4 py-2.5 text-center font-medium">Employees</th>
                  <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                  <th className="px-4 py-2.5 text-right font-medium">TOS</th>
                  <th className="px-4 py-2.5 text-right font-medium">NSSF EE</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net Salary</th>
                  <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      No payroll runs found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((run) => (
                    <tr key={run.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-xs">
                        {runNo(run.period_year, run.period_month)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{run.label ?? `${run.period_year}-${String(run.period_month).padStart(2, "0")}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(`${run.start_date}T00:00:00`), "d MMM")} – {format(new Date(`${run.end_date}T00:00:00`), "d MMM yyyy")}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold">{run.employee_count}</span>
                        {run.employee_count === 0 && <span className="text-xs text-muted-foreground ml-1">(no entries)</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {run.total_gross > 0 ? fmt(run.total_gross) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600">
                        {run.total_tos > 0 ? fmt(run.total_tos) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600">
                        {run.total_nssf_ee > 0 ? fmt(run.total_nssf_ee) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">
                        {run.total_net > 0 ? fmt(run.total_net) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={cn("capitalize text-[11px]", STATUS_COLORS[run.status] ?? "border-gray-200 bg-gray-50 text-gray-600")}>
                          {run.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/hr/payroll/run?period=${run.id}`} className="text-muted-foreground hover:text-primary transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
