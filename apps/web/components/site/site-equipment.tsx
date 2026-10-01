"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import {
  Plus,
  Loader2,
  Pencil,
  Search,
  Truck,
  Clock,
  Fuel,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  Wrench,
  X,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { todayISO } from "@/lib/planning/work-calendar";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  string,
  { label: string; badge: string }
> = {
  active: { label: "Active", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  idle: { label: "Idle / Standby", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  under_maintenance: { label: "Under Maintenance", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  off_site: { label: "Off Site", badge: "bg-slate-100 text-slate-600 border-slate-200" },
};

const OWNERSHIP_CONFIG: Record<string, string> = {
  owned: "Company Owned",
  hired: "Hired / Rented",
  subcontractor: "Subcontractor Plant",
};

interface EquipmentRow {
  id: string;
  project_id: string;
  date: string;
  equipment_name: string;
  equipment_code: string | null;
  equipment_type: string | null;
  operator: string | null;
  status: string;
  hours_operated: number;
  hours_standby?: number;
  hours_breakdown?: number;
  standby_reason?: string | null;
  hourly_cost_rate?: number;
  ownership_type?: "owned" | "hired" | "subcontractor";
  fuel_litres: number;
  location: string | null;
  notes: string | null;
  wbs_task_id?: string | null;
  delay_event_id?: string | null;
  wbs_tasks?: { task_code?: string; task_name?: string } | null;
}

interface WbsTaskOption {
  id: string;
  task_code: string;
  task_name: string;
}

export function SiteEquipment() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [tasks, setTasks] = useState<WbsTaskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EquipmentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [pushingDelayId, setPushingDelayId] = useState<string | null>(null);

  const supabase = createClient();

  // Form states
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [eqType, setEqType] = useState("");
  const [ownership, setOwnership] = useState<"owned" | "hired" | "subcontractor">("hired");
  const [operator, setOperator] = useState("");
  const [status, setStatus] = useState("active");
  const [hoursOp, setHoursOp] = useState("8");
  const [hoursStandby, setHoursStandby] = useState("0");
  const [hoursBreakdown, setHoursBreakdown] = useState("0");
  const [hourlyRate, setHourlyRate] = useState("45");
  const [standbyReason, setStandbyReason] = useState("");
  const [fuel, setFuel] = useState("");
  const [eqLocation, setEqLocation] = useState("");
  const [wbsTaskId, setWbsTaskId] = useState("");
  const [eqNotes, setEqNotes] = useState("");

  async function load() {
    if (!selectedProjectId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("site_equipment")
        .select("*, wbs_tasks(task_code, task_name)")
        .eq("project_id", selectedProjectId)
        .order("date", { ascending: false })
        .limit(300);

      if (error) throw error;
      setRows((data || []) as EquipmentRow[]);

      // Load tasks
      const { data: taskData } = await supabase
        .from("wbs_tasks")
        .select("id, task_code, task_name")
        .eq("project_id", selectedProjectId)
        .order("task_code", { ascending: true })
        .limit(200);

      setTasks(taskData || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [selectedProjectId]);

  function resetForm() {
    setDate(todayISO());
    setName("");
    setCode("");
    setEqType("");
    setOwnership("hired");
    setOperator("");
    setStatus("active");
    setHoursOp("8");
    setHoursStandby("0");
    setHoursBreakdown("0");
    setHourlyRate("45");
    setStandbyReason("");
    setFuel("");
    setEqLocation("");
    setWbsTaskId("");
    setEqNotes("");
    setEditing(null);
  }

  function openEdit(row: EquipmentRow) {
    setDate(row.date?.slice(0, 10) || todayISO());
    setName(row.equipment_name || "");
    setCode(row.equipment_code || "");
    setEqType(row.equipment_type || "");
    setOwnership(row.ownership_type || "hired");
    setOperator(row.operator || "");
    setStatus(row.status || "active");
    setHoursOp(row.hours_operated?.toString() || "0");
    setHoursStandby(row.hours_standby?.toString() || "0");
    setHoursBreakdown(row.hours_breakdown?.toString() || "0");
    setHourlyRate(row.hourly_cost_rate?.toString() || "0");
    setStandbyReason(row.standby_reason || "");
    setFuel(row.fuel_litres?.toString() || "0");
    setEqLocation(row.location || "");
    setWbsTaskId(row.wbs_task_id || "");
    setEqNotes(row.notes || "");
    setEditing(row);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) {
      toast.error("Please select a project first.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        project_id: selectedProjectId,
        date,
        equipment_name: name.trim(),
        equipment_code: code.trim() || null,
        equipment_type: eqType.trim() || null,
        ownership_type: ownership,
        operator: operator.trim() || null,
        status,
        hours_operated: parseFloat(hoursOp) || 0,
        hours_standby: parseFloat(hoursStandby) || 0,
        hours_breakdown: parseFloat(hoursBreakdown) || 0,
        hourly_cost_rate: parseFloat(hourlyRate) || 0,
        standby_reason: standbyReason.trim() || null,
        fuel_litres: parseFloat(fuel) || 0,
        location: eqLocation.trim() || null,
        wbs_task_id: wbsTaskId || null,
        notes: eqNotes.trim() || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("site_equipment")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Equipment log updated");
      } else {
        const { error } = await supabase.from("site_equipment").insert([payload]);
        if (error) throw error;
        toast.success("Equipment entry recorded");
      }

      setShowForm(false);
      resetForm();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handlePushToDelay(equipmentId: string) {
    setPushingDelayId(equipmentId);
    try {
      const { data, error } = await supabase.rpc("push_equipment_standby_to_delay", {
        p_equipment_id: equipmentId,
      });

      if (error) throw error;
      if (data && !data.success) {
        toast.error(data.error);
        return;
      }

      toast.success(
        `Standby delay registered in Delay Register! Cost impact logged: $${data?.cost_impact || 0}`,
        { duration: 5000 }
      );
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPushingDelayId(null);
    }
  }

  // Summary statistics
  const activeCount = rows.filter((r) => r.status === "active").length;
  const totalOperatingHours = rows.reduce((s, r) => s + (Number(r.hours_operated) || 0), 0);
  const totalStandbyHours = rows.reduce((s, r) => s + (Number(r.hours_standby) || 0), 0);
  const totalStandbyCost = rows.reduce(
    (s, r) => s + (Number(r.hours_standby) || 0) * (Number(r.hourly_cost_rate) || 0),
    0
  );

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.equipment_name?.toLowerCase().includes(q) ||
      r.equipment_code?.toLowerCase().includes(q) ||
      r.equipment_type?.toLowerCase().includes(q) ||
      r.operator?.toLowerCase().includes(q) ||
      r.wbs_tasks?.task_name?.toLowerCase().includes(q)
    );
  });

  if (projectLoading || loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top search & filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search machinery, operator, task..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Statuses ({rows.length})</option>
            {Object.keys(STATUS_CONFIG).map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>

        <Button
          size="sm"
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
          className="gap-1.5"
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Log Equipment
            </>
          )}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 border-border bg-card shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-blue-600" /> Active Machines
          </p>
          <p className="text-2xl font-bold mt-1 text-foreground">{activeCount}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Operating on site</p>
        </Card>

        <Card className="p-3 border-border bg-card shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-emerald-600" /> Total Operating Hours
          </p>
          <p className="text-2xl font-bold mt-1 text-foreground">{totalOperatingHours}h</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Productive machine hours</p>
        </Card>

        <Card className="p-3 border-border bg-card shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Standby Hours Lost
          </p>
          <p
            className={cn(
              "text-2xl font-bold mt-1",
              totalStandbyHours > 0 ? "text-amber-600" : "text-foreground"
            )}
          >
            {totalStandbyHours}h
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Idle waiting time</p>
        </Card>

        <Card className="p-3 border-border bg-card shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-rose-600" /> Standby Idle Cost
          </p>
          <p
            className={cn(
              "text-2xl font-bold mt-1",
              totalStandbyCost > 0 ? "text-rose-600" : "text-foreground"
            )}
          >
            ${totalStandbyCost.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Claimable plant loss</p>
        </Card>
      </div>

      {/* Form Card */}
      {showForm && (
        <Card className="border-primary/20 bg-card shadow-sm">
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">
                    {editing ? `Edit ${editing.equipment_name}` : "Log Plant & Heavy Machinery"}
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Date *</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Equipment Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Mobile Crane 50T / CAT 320"
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Equipment Code / Tag</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. CR-002"
                    className="text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Equipment Type / Category</Label>
                  <Input
                    value={eqType}
                    onChange={(e) => setEqType(e.target.value)}
                    placeholder="e.g. Earthmoving, Crane, Generator"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Ownership Type</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={ownership}
                    onChange={(e) =>
                      setOwnership(e.target.value as "owned" | "hired" | "subcontractor")
                    }
                  >
                    {Object.keys(OWNERSHIP_CONFIG).map((k) => (
                      <option key={k} value={k}>
                        {OWNERSHIP_CONFIG[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Status</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {Object.keys(STATUS_CONFIG).map((k) => (
                      <option key={k} value={k}>
                        {STATUS_CONFIG[k].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Operator Name</Label>
                  <Input
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    placeholder="e.g. Alex Tan"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Hours Operated</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={hoursOp}
                    onChange={(e) => setHoursOp(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-amber-600">Standby (Idle) Hours</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={hoursStandby}
                    onChange={(e) => setHoursStandby(e.target.value)}
                    className="text-xs border-amber-300"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-rose-600">Breakdown Hours</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={hoursBreakdown}
                    onChange={(e) => setHoursBreakdown(e.target.value)}
                    className="text-xs border-rose-300"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Hourly Cost Rate ($/hr)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="e.g. 50"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Fuel Consumed (Litres)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={fuel}
                    onChange={(e) => setFuel(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Linked Schedule Activity</Label>
                  <select
                    value={wbsTaskId}
                    onChange={(e) => setWbsTaskId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">(None - General Plant)</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.task_code}] {t.task_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Location / Work Area</Label>
                  <Input
                    value={eqLocation}
                    onChange={(e) => setEqLocation(e.target.value)}
                    placeholder="e.g. Basement Excavation Pit"
                    className="text-xs"
                  />
                </div>

                <div className="col-span-full space-y-1">
                  <Label className="text-xs font-semibold text-amber-700">
                    Standby / Idle Reason (For Delay Claims)
                  </Label>
                  <Input
                    value={standbyReason}
                    onChange={(e) => setStandbyReason(e.target.value)}
                    placeholder="e.g. Waiting for concrete delivery truck; Rain stoppage; Access denied by client"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : editing ? (
                    "Update Log"
                  ) : (
                    "Save Equipment"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Equipment Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Equipment</th>
                <th className="px-4 py-3">Type & Ownership</th>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Operating</th>
                <th className="px-4 py-3 text-right">Standby / Break</th>
                <th className="px-4 py-3 text-right">Fuel (L)</th>
                <th className="px-4 py-3 text-center">Delay Link</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const conf = STATUS_CONFIG[r.status] || {
                  label: r.status,
                  badge: "bg-slate-100 text-slate-700 border-slate-200",
                };
                const hasDowntime = (Number(r.hours_standby) || 0) > 0 || (Number(r.hours_breakdown) || 0) > 0;
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {r.date?.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{r.equipment_name}</p>
                      {r.equipment_code && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {r.equipment_code}
                        </span>
                      )}
                      {r.wbs_tasks && (
                        <div className="flex items-center gap-1 text-[10px] text-blue-600 font-medium truncate max-w-[160px]">
                          <Layers className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{r.wbs_tasks.task_name}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="font-medium text-foreground">{r.equipment_type || "Machinery"}</span>
                      <span className="block text-[10px] text-muted-foreground capitalize">
                        {r.ownership_type || "hired"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.operator || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                          conf.badge
                        )}
                      >
                        {conf.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                      {r.hours_operated}h
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {hasDowntime ? (
                        <div>
                          {Number(r.hours_standby) > 0 && (
                            <span className="text-amber-600 font-semibold block">
                              +{r.hours_standby}h standby
                            </span>
                          )}
                          {Number(r.hours_breakdown) > 0 && (
                            <span className="text-rose-600 font-semibold block">
                              +{r.hours_breakdown}h breakdown
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">0h</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {r.fuel_litres ? `${r.fuel_litres}L` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.delay_event_id ? (
                        <span className="inline-flex items-center gap-1 rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                          <CheckCircle2 className="h-3 w-3 text-purple-600" /> In Delay Register
                        </span>
                      ) : hasDowntime ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePushToDelay(r.id)}
                          disabled={pushingDelayId === r.id}
                          className="h-6 text-[10px] px-2 text-amber-700 border-amber-300 hover:bg-amber-50 gap-1 font-semibold"
                        >
                          {pushingDelayId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileWarning className="h-3 w-3" />
                          )}
                          Push Delay
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(r)}
                        className="h-7 px-2 gap-1 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Truck className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="font-medium text-foreground">No equipment logs found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Log daily plant operations, idle standby hours, and fuel consumption.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
