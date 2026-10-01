"use client";

import { Fragment, useEffect, useState } from "react";
import { createEotNoticeFromDelay, deleteDelayRegisterById, deleteDelayRegisterTasksByDelayId, insertDelayRegisterReturning, insertDelayRegisterTasks, listContractRegisterByProjectId, listDelayRegisterByProjectIdOrderedByCreatedAt, listDelayRegisterTasksByDelayIds, listWbsTasksByProjectIdOrderedByTaskCode, updateDelayRegisterByIdReturning } from "@/lib/planning/planning-queries";
import { useProject } from "@/components/dashboard/project-context";
import { Plus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Lifecycle = "notified" | "assessed" | "submitted" | "agreed" | "rejected" | "closed";

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
  /** Completion Plan 2.5 — delay governance. */
  lifecycle: Lifecycle;
  eot_notice_id: string | null;
  taskIds: string[];
}

interface TaskOption { id: string; task_code: string; task_name: string; }
interface ContractOption { id: string; contract_no: string; title: string; }

const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  notified: "Notified",
  assessed: "Assessed",
  submitted: "Submitted",
  agreed: "Agreed",
  rejected: "Rejected",
  closed: "Closed",
};
const LIFECYCLE_COLORS: Record<Lifecycle, string> = {
  notified: "bg-slate-100 text-slate-600",
  assessed: "bg-blue-100 text-blue-700",
  submitted: "bg-violet-100 text-violet-700",
  agreed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  closed: "bg-slate-200 text-slate-700",
};

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
  task_ids: string[];
  description: string;
  delay_type: "excusable" | "non_excusable" | "compensable" | "non_compensable";
  cause: string;
  responsible_party: string;
  start_date: string;
  finish_date: string;
  status: "open" | "resolved" | "disputed";
  lifecycle: Lifecycle;
  notes: string;
}

const EMPTY_FORM: DelayForm = {
  task_ids: [],
  description: "",
  delay_type: "excusable",
  cause: "",
  responsible_party: "",
  start_date: "",
  finish_date: "",
  status: "open",
  lifecycle: "notified",
  notes: "",
};

type FilterStatus = "all" | "open" | "resolved" | "disputed";

export function PlanDelayRegister() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<DelayRow[]>([]);
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([]);
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DelayRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [form, setForm] = useState<DelayForm>(EMPTY_FORM);
  const [raisingEotFor, setRaisingEotFor] = useState<string | null>(null);
  const [eotContractId, setEotContractId] = useState("");
  const [eotBusy, setEotBusy] = useState(false);

  async function load() {
    if (!selectedProjectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    // delay_register_tasks has no project_id column of its own, so it can only be
    // scoped by delay_id — fetch delay_register first, then filter the link table
    // to just this project's delay ids instead of pulling every project's rows.
    const delaysRes = await listDelayRegisterByProjectIdOrderedByCreatedAt(selectedProjectId, "*");
    const delayIds = (delaysRes.data ?? []).map((r) => (r as { id: string }).id);
    const [tasksRes, linksRes, contractsRes] = await Promise.all([
      listWbsTasksByProjectIdOrderedByTaskCode(selectedProjectId),
      delayIds.length > 0
        ? listDelayRegisterTasksByDelayIds(delayIds)
        : Promise.resolve({ data: [] as { delay_id: string; wbs_task_id: string }[] }),
      listContractRegisterByProjectId(selectedProjectId),
    ]);
    if (delaysRes.error) {
      toast.error(delaysRes.error.message);
    } else {
      const linksByDelay = new Map<string, string[]>();
      for (const l of (linksRes.data ?? []) as { delay_id: string; wbs_task_id: string }[]) {
        if (!linksByDelay.has(l.delay_id)) linksByDelay.set(l.delay_id, []);
        linksByDelay.get(l.delay_id)!.push(l.wbs_task_id);
      }
      setRows(
        (delaysRes.data as Omit<DelayRow, "taskIds">[]).map((r) => ({
          ...r,
          taskIds: linksByDelay.get(r.id) ?? (r.wbs_task_id ? [r.wbs_task_id] : []),
        })),
      );
    }
    if (tasksRes.data) setTaskOptions(tasksRes.data as TaskOption[]);
    if (contractsRes.data) setContractOptions(contractsRes.data as ContractOption[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  function resetForm() { setForm(EMPTY_FORM); setEditing(null); }

  function openEdit(row: DelayRow) {
    setForm({
      task_ids: row.taskIds,
      description: row.description,
      delay_type: row.delay_type,
      cause: row.cause ?? "",
      responsible_party: row.responsible_party ?? "",
      start_date: row.start_date ?? "",
      finish_date: row.finish_date ?? "",
      status: row.status,
      lifecycle: row.lifecycle,
      notes: row.notes ?? "",
    });
    setEditing(row);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      project_id: selectedProjectId,
      description: form.description,
      delay_type: form.delay_type,
      cause: form.cause || null,
      responsible_party: form.responsible_party || null,
      start_date: form.start_date || null,
      finish_date: form.finish_date || null,
      status: form.status,
      lifecycle: form.lifecycle,
      notes: form.notes || null,
      wbs_task_id: form.task_ids[0] ?? null,
    };
    const { data: savedRow, error } = editing
      ? await updateDelayRegisterByIdReturning(payload, editing.id)
      : await insertDelayRegisterReturning({ ...payload, delay_code: "" });
    if (error) { toast.error(error.message); setSaving(false); return; }
    const delayId = savedRow.id as string;
    const { error: delLinksError } = await deleteDelayRegisterTasksByDelayId(delayId);
    if (delLinksError) { toast.error(delLinksError.message); setSaving(false); return; }
    if (form.task_ids.length > 0) {
      const { error: linkError } = await insertDelayRegisterTasks(form.task_ids.map((taskId) => ({ delay_id: delayId, wbs_task_id: taskId })));
      if (linkError) { toast.error(linkError.message); setSaving(false); return; }
    }
    toast.success(editing ? "Delay updated" : "Delay logged");
    setShowForm(false);
    resetForm();
    load();
    setSaving(false);
  }

  async function raiseEotNotice(delayId: string) {
    if (!eotContractId) { toast.error("Select a contract first"); return; }
    setEotBusy(true);
    const { error } = await createEotNoticeFromDelay({
      p_delay_id: delayId,
      p_contract_id: eotContractId,
      p_deadline: null,
    });
    setEotBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("EOT notice raised");
    setRaisingEotFor(null);
    setEotContractId("");
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await deleteDelayRegisterById(id);
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
              <div className="col-span-2 space-y-1.5">
                <Label>Linked Tasks {form.task_ids.length > 0 && <span className="text-muted-foreground">({form.task_ids.length} selected)</span>}</Label>
                <div className="max-h-32 overflow-y-auto rounded-md border border-input p-2 space-y-1">
                  {taskOptions.map(t => (
                    <label key={t.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={form.task_ids.includes(t.id)}
                        onChange={e => setForm(p => ({
                          ...p,
                          task_ids: e.target.checked ? [...p.task_ids, t.id] : p.task_ids.filter(id => id !== t.id),
                        }))}
                      />
                      <span className="font-mono text-muted-foreground">{t.task_code}</span> {t.task_name}
                    </label>
                  ))}
                  {taskOptions.length === 0 && <p className="text-xs text-muted-foreground">No tasks available.</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Lifecycle</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.lifecycle} onChange={e => setForm(p => ({ ...p, lifecycle: e.target.value as Lifecycle }))}>
                  {Object.entries(LIFECYCLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Delay Type *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.delay_type} onChange={e => setForm(p => ({ ...p, delay_type: e.target.value as DelayForm["delay_type"] }))}>
                  {Object.entries(DELAY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as DelayForm["status"] }))}>
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
              <th className="px-3 py-2 text-left font-medium">Lifecycle</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <Fragment key={r.id}>
                <tr className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs font-medium">{r.delay_code}</td>
                  <td className="px-3 py-2 max-w-xs">
                    <p className="font-medium truncate">{r.description}</p>
                    {r.notes && <p className="text-xs text-muted-foreground truncate">{r.notes}</p>}
                    {r.taskIds.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {r.taskIds.length} task{r.taskIds.length > 1 ? "s" : ""} linked
                      </p>
                    )}
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
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${LIFECYCLE_COLORS[r.lifecycle]}`}>
                      {LIFECYCLE_LABELS[r.lifecycle]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                      {r.eot_notice_id ? (
                        <Badge variant="outline" className="text-[10px]">EOT raised</Badge>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => { setRaisingEotFor(raisingEotFor === r.id ? null : r.id); setEotContractId(""); }}>
                          EOT
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {raisingEotFor === r.id && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={10} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Raise EOT notice under contract:</span>
                        <select
                          className="flex h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                          value={eotContractId}
                          onChange={e => setEotContractId(e.target.value)}
                        >
                          <option value="">Select contract…</option>
                          {contractOptions.map(c => <option key={c.id} value={c.id}>{c.contract_no} — {c.title}</option>)}
                        </select>
                        <Button size="sm" disabled={eotBusy || !eotContractId} onClick={() => raiseEotNotice(r.id)}>
                          {eotBusy ? "Raising..." : "Raise Notice"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRaisingEotFor(null)}>Cancel</Button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
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
