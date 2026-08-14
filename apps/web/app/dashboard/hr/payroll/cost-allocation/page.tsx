"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Lock,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  label: string;
  period_year: number;
  period_month: number;
  status: string;
}

interface AllocationRow {
  entry_id: string;
  employee_name: string;
  department: string;
  total_cost: number;
  allocations: Allocation[];
  isEditing: boolean;
}

interface Allocation {
  id?: string;
  project_id: string | null;
  project_label: string;
  wbs_element_id: string | null;
  wbs_label: string;
  task_id: string | null;
  task_label: string;
  department: string;
  allocation_method: string;
  allocation_percent: number;
  allocated_amount: number;
  is_overhead: boolean;
  status: string;
  note: string;
}

interface Project {
  id: string;
  project_name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function totalPercent(allocations: Allocation[]) {
  return allocations.reduce((s, a) => s + a.allocation_percent, 0);
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-gray-200 bg-gray-50 text-gray-600",
  confirmed: "border-blue-200 bg-blue-50 text-blue-700",
  locked: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const PERIOD_STATUS_LOCKED = new Set(["locked", "exported", "paid"]);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CostAllocationPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => { if (data.user) setCurrentUserId(data.user.id); });

    Promise.all([
      supabase.from("payroll_periods").select("id, label, period_year, period_month, status").order("period_year", { ascending: false }).order("period_month", { ascending: false }),
      supabase.from("projects").select("id, project_name").order("project_name").limit(100),
    ]).then(([pRes, projRes]) => {
      const ps = (pRes.data ?? []) as Period[];
      setPeriods(ps);
      setProjects((projRes.data ?? []) as Project[]);
      const first = ps[0];
      if (first) { setSelectedPeriodId(first.id); setSelectedPeriod(first); }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) return;
    setLoadingEntries(true);
    const supabase = createClient();

    Promise.all([
      supabase.from("payroll_entries")
        .select("id, gross_salary, total_nssf_er, employer_contributions, profiles!employee_id(full_name, department)")
        .eq("period_id", selectedPeriodId),
      supabase.from("payroll_cost_allocations")
        .select("id, payroll_entry_id, project_id, wbs_element_id, task_id, department, allocation_method, allocation_percent, allocated_amount, is_overhead, status, note")
        .in("status", ["pending", "confirmed", "locked"]),
    ]).then(([eRes, aRes]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries = (eRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingAllocations = (aRes.data ?? []) as any[];

      const allocByEntry: Record<string, Allocation[]> = {};
      for (const a of existingAllocations) {
        if (!allocByEntry[a.payroll_entry_id]) allocByEntry[a.payroll_entry_id] = [];
        allocByEntry[a.payroll_entry_id].push({
          id: a.id,
          project_id: a.project_id,
          project_label: a.project_id ? "Project" : "—",
          wbs_element_id: a.wbs_element_id,
          wbs_label: "—",
          task_id: a.task_id,
          task_label: "—",
          department: a.department ?? "",
          allocation_method: a.allocation_method,
          allocation_percent: Number(a.allocation_percent),
          allocated_amount: Number(a.allocated_amount),
          is_overhead: a.is_overhead,
          status: a.status,
          note: a.note ?? "",
        });
      }

      const newRows: AllocationRow[] = entries.map((e) => {
        const totalCost = Number(e.gross_salary) + Number(e.total_nssf_er ?? e.employer_contributions ?? 0);
        return {
          entry_id: e.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          employee_name: (e.profiles as any)?.full_name ?? "—",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          department: (e.profiles as any)?.department ?? "—",
          total_cost: totalCost,
          allocations: allocByEntry[e.id] ?? [],
          isEditing: false,
        };
      });

      setRows(newRows);
      setLoadingEntries(false);
    });
  }, [selectedPeriodId]);

  // ── Allocation helpers ─────────────────────────────────────────────────────

  function addAllocation(entryId: string) {
    setRows((prev) => prev.map((r) => {
      if (r.entry_id !== entryId) return r;
      const remaining = Math.max(0, 100 - totalPercent(r.allocations));
      return {
        ...r,
        isEditing: true,
        allocations: [...r.allocations, {
          project_id: null,
          project_label: "",
          wbs_element_id: null,
          wbs_label: "",
          task_id: null,
          task_label: "",
          department: r.department,
          allocation_method: "manual",
          allocation_percent: remaining,
          allocated_amount: (r.total_cost * remaining) / 100,
          is_overhead: false,
          status: "pending",
          note: "",
        }],
      };
    }));
  }

  function updateAllocation(entryId: string, allocationIdx: number, field: keyof Allocation, value: unknown) {
    setRows((prev) => prev.map((r) => {
      if (r.entry_id !== entryId) return r;
      const updatedAllocations = r.allocations.map((a, i) => {
        if (i !== allocationIdx) return a;
        const updated = { ...a, [field]: value };
        // Recalculate amount when percent changes
        if (field === "allocation_percent") {
          updated.allocated_amount = (r.total_cost * Number(value)) / 100;
        }
        return updated;
      });
      return { ...r, allocations: updatedAllocations };
    }));
  }

  function removeAllocation(entryId: string, allocationIdx: number) {
    setRows((prev) => prev.map((r) => {
      if (r.entry_id !== entryId) return r;
      return { ...r, allocations: r.allocations.filter((_, i) => i !== allocationIdx) };
    }));
  }

  // ── Save allocations ───────────────────────────────────────────────────────

  async function saveAllocations(entryId: string) {
    const row = rows.find((r) => r.entry_id === entryId);
    if (!row) return;

    const total = totalPercent(row.allocations);
    if (Math.abs(total - 100) > 0.01 && row.allocations.length > 0) {
      toast.error(`Total allocation must equal 100% (currently ${total.toFixed(1)}%)`);
      return;
    }

    setSaving(true);
    const supabase = createClient();

    for (const alloc of row.allocations) {
      const payload = {
        payroll_entry_id: entryId,
        project_id: alloc.project_id || null,
        department: alloc.department || null,
        allocation_method: alloc.allocation_method,
        allocation_percent: alloc.allocation_percent,
        allocated_amount: alloc.allocated_amount,
        is_overhead: alloc.is_overhead,
        status: "confirmed",
        confirmed_by: currentUserId,
        confirmed_at: new Date().toISOString(),
        note: alloc.note || null,
        created_by: currentUserId,
      };

      if (alloc.id) {
        const { error } = await supabase.from("payroll_cost_allocations").update(payload).eq("id", alloc.id);
        if (error) { toast.error(error.message); setSaving(false); return; }
      } else {
        const { error, data } = await supabase.from("payroll_cost_allocations").insert(payload).select("id").single();
        if (error) { toast.error(error.message); setSaving(false); return; }
        if (data) {
          setRows((prev) => prev.map((r) => r.entry_id !== entryId ? r : {
            ...r,
            allocations: r.allocations.map((a) => a === alloc ? { ...a, id: data.id, status: "confirmed" } : a),
          }));
        }
      }
    }

    toast.success(`Allocation saved for ${row.employee_name}`);
    setRows((prev) => prev.map((r) => r.entry_id !== entryId ? r : {
      ...r,
      isEditing: false,
      allocations: r.allocations.map((a) => ({ ...a, status: "confirmed" })),
    }));
    setSaving(false);
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  const filtered = rows.filter((r) => {
    if (deptFilter && !r.department.toLowerCase().includes(deptFilter.toLowerCase())) return false;
    if (statusFilter === "unallocated" && r.allocations.length > 0) return false;
    if (statusFilter === "confirmed" && r.allocations.some((a) => a.status !== "confirmed")) return false;
    return true;
  });

  const totalAllocated = rows.filter((r) => r.allocations.length > 0 && Math.abs(totalPercent(r.allocations) - 100) < 0.01).length;
  const isLocked = selectedPeriod && PERIOD_STATUS_LOCKED.has(selectedPeriod.status);

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h2 className="text-2xl font-bold tracking-tight">Payroll Cost Allocation</h2>
        <p className="text-muted-foreground text-sm">Allocate payroll cost to projects, WBS, and departments</p>
      </div>

      {/* Period + filter bar */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Payroll Period</label>
              <select
                value={selectedPeriodId}
                onChange={(e) => {
                  setSelectedPeriodId(e.target.value);
                  setSelectedPeriod(periods.find((p) => p.id === e.target.value) ?? null);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label ?? `${p.period_year}-${String(p.period_month).padStart(2, "0")}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Department</label>
              <Input value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} placeholder="Filter…" className="w-36" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All</option>
                <option value="unallocated">Unallocated</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
            {selectedPeriod && (
              <Badge variant="outline" className={cn("capitalize", selectedPeriod.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600")}>
                Period: {selectedPeriod.status.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          {rows.length > 0 && (
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span><strong>{totalAllocated}</strong> / {rows.length} employees fully allocated</span>
              <span>Total payroll cost: <strong>{fmt(rows.reduce((s, r) => s + r.total_cost, 0))}</strong></span>
            </div>
          )}
        </CardContent>
      </Card>

      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <Lock className="h-4 w-4 shrink-0" /> Payroll is locked. Allocations are read-only.
        </div>
      )}

      {/* Allocation table */}
      {loadingEntries ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No payroll entries found for this period.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const total = totalPercent(row.allocations);
            const isFull = Math.abs(total - 100) < 0.01;
            const isOver = total > 100;
            return (
              <Card key={row.entry_id} className={cn(isOver && "border-red-200")}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold">{row.employee_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{row.department}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Total Cost: {fmt(row.total_cost)}
                    </Badge>
                    {isFull && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {isOver && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    {!isFull && !isOver && total > 0 && (
                      <span className="text-xs text-amber-600">{total.toFixed(1)}% / 100%</span>
                    )}
                    {total === 0 && (
                      <span className="text-xs text-muted-foreground">Not allocated</span>
                    )}
                  </div>
                  {!isLocked && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => addAllocation(row.entry_id)} className="gap-1 h-7 text-xs">
                        <Plus className="h-3 w-3" /> Add Line
                      </Button>
                      {row.allocations.length > 0 && (
                        <Button size="sm" onClick={() => saveAllocations(row.entry_id)} disabled={saving} className="gap-1 h-7 text-xs">
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                        </Button>
                      )}
                    </div>
                  )}
                </CardHeader>
                {row.allocations.length > 0 && (
                  <CardContent className="pt-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-1.5 text-left font-medium">Project / Dept</th>
                          <th className="py-1.5 text-left font-medium">Method</th>
                          <th className="py-1.5 text-right font-medium">%</th>
                          <th className="py-1.5 text-right font-medium">Amount</th>
                          <th className="py-1.5 text-center font-medium">Status</th>
                          {!isLocked && <th className="py-1.5" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {row.allocations.map((alloc, idx) => (
                          <tr key={alloc.id ?? idx}>
                            <td className="py-2 pr-2">
                              {!isLocked ? (
                                <select
                                  value={alloc.project_id ?? "overhead"}
                                  onChange={(e) => updateAllocation(row.entry_id, idx, "project_id", e.target.value === "overhead" ? null : e.target.value)}
                                  className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs"
                                >
                                  <option value="overhead">Overhead / Dept</option>
                                  {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                                </select>
                              ) : (
                                <span>{alloc.project_id ? projects.find((p) => p.id === alloc.project_id)?.project_name ?? alloc.project_id : "Overhead"}</span>
                              )}
                            </td>
                            <td className="py-2 pr-2">
                              {!isLocked ? (
                                <select
                                  value={alloc.allocation_method}
                                  onChange={(e) => updateAllocation(row.entry_id, idx, "allocation_method", e.target.value)}
                                  className="h-7 rounded border border-input bg-background px-1.5 text-xs"
                                >
                                  <option value="manual">Manual</option>
                                  <option value="timesheet">Timesheet</option>
                                  <option value="department_default">Dept Default</option>
                                  <option value="project">Project</option>
                                </select>
                              ) : <span className="capitalize">{alloc.allocation_method}</span>}
                            </td>
                            <td className="py-2 pr-2 text-right">
                              {!isLocked ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={100}
                                  value={alloc.allocation_percent}
                                  onChange={(e) => updateAllocation(row.entry_id, idx, "allocation_percent", Number(e.target.value))}
                                  className="h-7 w-16 text-right text-xs"
                                />
                              ) : <span className="tabular-nums">{alloc.allocation_percent}%</span>}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums font-medium">
                              {fmt(alloc.allocated_amount)}
                            </td>
                            <td className="py-2 text-center">
                              <Badge variant="outline" className={cn("text-[10px] capitalize", STATUS_COLORS[alloc.status] ?? "")}>
                                {alloc.status}
                              </Badge>
                            </td>
                            {!isLocked && (
                              <td className="py-2 pl-2 text-right">
                                <button onClick={() => removeAllocation(row.entry_id, idx)} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {/* Total row */}
                        <tr className="border-t font-semibold">
                          <td colSpan={2} className="py-1.5 text-muted-foreground">Total</td>
                          <td className={cn("py-1.5 text-right tabular-nums", isOver ? "text-red-600" : isFull ? "text-emerald-600" : "text-amber-600")}>
                            {total.toFixed(1)}%
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmt(row.allocations.reduce((s, a) => s + a.allocated_amount, 0))}
                          </td>
                          <td colSpan={isLocked ? 1 : 2} />
                        </tr>
                      </tbody>
                    </table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
