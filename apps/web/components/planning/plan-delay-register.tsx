"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { Plus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DelayRow {
  id: string;
  project_id: string;
  wbs_task_id: string | null;
  delay_code: string;
  description: string;
  delay_type: "excusable" | "non_excusable" | "compensable" | "non_compensable";
  cause: string | null;
  responsible_party: string | null;
  start_date: string | null;
  finish_date: string | null;
  impact_days: number | null;
  status: "open" | "resolved" | "disputed";
  notes: string | null;
  created_at: string;
}

interface TaskOption { id: string; task_code: string; task_name: string; }

const DELAY_TYPE_LABELS: Record<string, string> = {
  excusable: "Excusable",
  non_excusable: "Non-Excusable",
  compensable: "Compensable",
  non_compensable: "Non-Compensable",
};

const DELAY_TYPE_COLORS: Record<string, string> = {
  excusable: "bg-blue-100 text-blue-700",
  non_excusable: "bg-red-100 text-red-700",
  compensable: "bg-green-100 text-green-700",
  non_compensable: "bg-gray-100 text-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  disputed: "bg-red-100 text-red-700",
};

interface DelayForm {
  wbs_task_id: string;
  description: string;
  delay_type: "excusable" | "non_excusable" | "compensable" | "non_compensable";
  cause: string;
  responsible_party: string;
  start_date: string;
  finish_date: string;
  status: "open" | "resolved" | "disputed";
  notes: string;
}

const EMPTY_FORM: DelayForm = {
  wbs_task_id: "",
  description: "",
  delay_type: "excusable",
  cause: "",
  responsible_party: "",
  start_date: "",
  finish_date: "",
  status: "open",
  notes: "",
};

type FilterStatus = "all" | "open" | "resolved" | "disputed";

export function PlanDelayRegister() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<DelayRow[]>([]);
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DelayRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [form, setForm] = useState<DelayForm>(EMPTY_FORM);

  async function load() {
    if (!selectedProjectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const [delaysRes, tasksRes] = await Promise.all([
      supabase.from("delay_register").select("*").eq("project_id", selectedProjectId).order("created_at", { ascending: false }),
      supabase.from("wbs_tasks").select("id, task_code, task_name").eq("project_id", selectedProjectId).order("task_code").limit(500),
    ]);
    if (delaysRes.error) toast.error(delaysRes.error.message);
    else setRows(delaysRes.data as DelayRow[]);
    if (tasksRes.data) setTaskOptions(tasksRes.data as TaskOption[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [selectedProjectId]);

  function resetForm() { setForm(EMPTY_FORM); setEditing(null); }

  function openEdit(row: DelayRow) {
    setForm({
      wbs_task_id: row.wbs_task_id ?? "",
      description: row.description,
      delay_type: row.delay_type,
      cause: row.cause ?? "",
      responsible_party: row.responsible_party ?? "",
      start_date: row.start_date ?? "",
      finish_date: row.finish_date ?? "",
      status: row.status,
      notes: row.notes ?? "",
    });
    setEditing(row);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) return;
    setSaving(true);
    const payload: Record<string, any> = {
      project_id: selectedProjectId,
      description: form.description,
      delay_type: form.delay_type,
      cause: form.cause || null,
      responsible_party: form.responsible_party || null,
      start_date: form.start_date || null,
      finish_date: form.finish_date || null,
      status: form.status,
      notes: form.notes || null,
      wbs_task_id: form.wbs_task_id || null,
    };
    const { error } = editing
      ? await supabase.from("delay_register").update(payload).eq("id", editing.id)
      : await supabase.from("delay_register").insert([{ ...payload, delay_code: "" }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Delay updated" : "Delay logged");
    setShowForm(false);
    resetForm();
    load();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("delay_register").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); setRows(prev => prev.filter(r => r.id !== id)); }
  }

  const filtered = rows.filter(r => filterStatus === "all" || r.status === filterStatus);
  const counts = { open: rows.filter(r => r.status === "open").length, resolved: rows.filter(r => r.status === "resolved").length, disputed: rows.filter(r => r.status === "disputed").length };

  if (projectLoading || loading) return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Select a project to view the delay register.</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["all", "open", "resolved", "disputed"] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filterStatus === s ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "all" ? `All (${rows.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s]})`}
            </button>
          ))}
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }} size="sm">
          {showForm ? <><X className="mr-1 h-4 w-4" />Cancel</> : <><Plus className="mr-1 h-4 w-4" />Log Delay</>}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Description *</Label>
                <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} required placeholder="Brief description of the delay" />
              </div>
              <div className="space-y-1.5">
                <Label>Linked Task</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.wbs_task_id} onChange={e => setForm(p => ({ ...p, wbs_task_id: e.target.value }))}>
                  <option value="">None</option>
                  {taskOptions.map(t => <option key={t.id} value={t.id}>{t.task_code} — {t.task_name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Delay Type *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.delay_type} onChange={e => setForm(p => ({ ...p, delay_type: e.target.value as any }))}>
                  {Object.entries(DELAY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))}>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="disputed">Disputed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Cause</Label>
                <Input value={form.cause} onChange={e => setForm(p => ({ ...p, cause: e.target.value }))} placeholder="Root cause of delay" />
              </div>
              <div className="space-y-1.5">
                <Label>Responsible Party</Label>
                <Input value={form.responsible_party} onChange={e => setForm(p => ({ ...p, responsible_party: e.target.value }))} placeholder="e.g. Contractor, Client, Designer" />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Finish Date</Label>
                <Input type="date" value={form.finish_date} onChange={e => setForm(p => ({ ...p, finish_date: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Log Delay"}</Button>
            </div>
          </form>
        </CardContent></Card>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Cause</th>
              <th className="px-3 py-2 text-left font-medium">Responsible</th>
              <th className="px-3 py-2 text-center font-medium">Start</th>
              <th className="px-3 py-2 text-center font-medium">Finish</th>
              <th className="px-3 py-2 text-center font-medium">Days</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-xs font-medium">{r.delay_code}</td>
                <td className="px-3 py-2 max-w-xs">
                  <p className="font-medium truncate">{r.description}</p>
                  {r.notes && <p className="text-xs text-muted-foreground truncate">{r.notes}</p>}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DELAY_TYPE_COLORS[r.delay_type]}`}>
                    {DELAY_TYPE_LABELS[r.delay_type]}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{r.cause || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.responsible_party || "—"}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{r.start_date?.slice(0, 10) || "—"}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{r.finish_date?.slice(0, 10) || "—"}</td>
                <td className="px-3 py-2 text-center">
                  {r.impact_days !== null ? (
                    <span className={cn("font-semibold", r.impact_days > 7 ? "text-red-600" : r.impact_days > 0 ? "text-yellow-600" : "")}>
                      {r.impact_days}d
                    </span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filterStatus === "all" ? "No delay events logged yet." : `No ${filterStatus} delays.`}
          </p>
        )}
      </div>
    </div>
  );
}
