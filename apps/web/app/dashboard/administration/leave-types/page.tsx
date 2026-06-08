"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, X, AlertTriangle, Settings } from "lucide-react";

// ── Color helpers ──────────────────────────────────────────────────────────────
const COLOR_OPTIONS = [
  { value: "blue",    label: "blue" },
  { value: "red",     label: "red" },
  { value: "green",   label: "green" },
  { value: "purple",  label: "purple" },
  { value: "amber",   label: "amber" },
  { value: "cyan",    label: "cyan" },
  { value: "pink",    label: "pink" },
  { value: "indigo",  label: "indigo" },
  { value: "emerald", label: "emerald" },
  { value: "teal",    label: "teal" },
  { value: "orange",  label: "orange" },
  { value: "gray",    label: "gray" },
];
const COLOR_HEX: Record<string, string> = {
  blue: "#3B82F6", red: "#EF4444", green: "#22C55E", purple: "#A855F7",
  amber: "#F59E0B", cyan: "#06B6D4", pink: "#EC4899", indigo: "#6366F1",
  emerald: "#10B981", teal: "#14B8A6", orange: "#F97316", gray: "#9CA3AF",
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
        checked ? "bg-primary" : "bg-input")}>
      <span className={cn("pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform",
        checked ? "translate-x-5" : "translate-x-0")} />
    </button>
  );
}

interface LeaveType {
  id: string; leave_code: string; leave_name: string; color: string;
  max_days_per_year: number; is_paid: boolean; carryover_allowed: boolean;
  max_carryover: number; half_day_allowed: boolean; probation_required: boolean;
  requires_document: boolean; skip_team_capacity: boolean; advance_notice_days: number;
  max_days_per_request: number; gender_restriction: string; is_replacement_leave: boolean;
  seniority_based: boolean; monthly_accrual: boolean; cancel_window_days: number;
  deduct_from_type_id: string | null; is_active: boolean;
}
interface LeaveTypeForm {
  leave_code: string; leave_name: string; color: string; max_days_per_year: number;
  is_paid: boolean; carryover_allowed: boolean; max_carryover: number; half_day_allowed: boolean;
  probation_required: boolean; requires_document: boolean; skip_team_capacity: boolean;
  advance_notice_days: number; max_days_per_request: number; gender_restriction: string;
  is_replacement_leave: boolean; seniority_based: boolean; monthly_accrual: boolean;
  cancel_window_days: number; deduct_from_type_id: string | null; is_active: boolean;
}
const DEFAULT_FORM: LeaveTypeForm = {
  leave_code: "", leave_name: "", color: "blue", max_days_per_year: 0, is_paid: true,
  carryover_allowed: false, max_carryover: 0, half_day_allowed: true, probation_required: false,
  requires_document: false, skip_team_capacity: false, advance_notice_days: 0, max_days_per_request: 0,
  gender_restriction: "all", is_replacement_leave: false, seniority_based: false,
  monthly_accrual: false, cancel_window_days: 0, deduct_from_type_id: null, is_active: true,
};
const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";
const labelCls = "block text-sm font-medium text-foreground mb-1";

export default function LeaveTypesAdminPage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [form, setForm] = useState<LeaveTypeForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<LeaveType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const refresh = async () => {
    const { data } = await createClient().from("leave_types").select("*").order("leave_name");
    setLeaveTypes(data || []);
  };

  useEffect(() => {
    refresh().then(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditingType(null); setForm(DEFAULT_FORM); setFormError(null); setShowForm(true);
  };
  const openEdit = (lt: LeaveType) => {
    setEditingType(lt);
    setForm({
      leave_code: lt.leave_code, leave_name: lt.leave_name, color: lt.color || "blue",
      max_days_per_year: lt.max_days_per_year ?? 0, is_paid: lt.is_paid ?? true,
      carryover_allowed: lt.carryover_allowed ?? false, max_carryover: lt.max_carryover ?? 0,
      half_day_allowed: lt.half_day_allowed ?? true, probation_required: lt.probation_required ?? false,
      requires_document: lt.requires_document ?? false, skip_team_capacity: lt.skip_team_capacity ?? false,
      advance_notice_days: lt.advance_notice_days ?? 0, max_days_per_request: lt.max_days_per_request ?? 0,
      gender_restriction: lt.gender_restriction || "all", is_replacement_leave: lt.is_replacement_leave ?? false,
      seniority_based: lt.seniority_based ?? false, monthly_accrual: lt.monthly_accrual ?? false,
      cancel_window_days: lt.cancel_window_days ?? 0, deduct_from_type_id: lt.deduct_from_type_id ?? null,
      is_active: lt.is_active ?? true,
    });
    setFormError(null); setShowForm(true);
  };
  const save = async () => {
    if (!form.leave_name.trim()) { setFormError("Name is required."); return; }
    if (!form.leave_code.trim()) { setFormError("Code is required."); return; }
    setSaving(true); setFormError(null);
    const supabase = createClient();
    const payload = { ...form, deduct_from_type_id: form.deduct_from_type_id || null };
    const { error } = editingType
      ? await supabase.from("leave_types").update(payload).eq("id", editingType.id)
      : await supabase.from("leave_types").insert(payload);
    if (error) { setFormError(error.message); } else { await refresh(); setShowForm(false); }
    setSaving(false);
  };
  const set = <K extends keyof LeaveTypeForm>(k: K, v: LeaveTypeForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const confirmDelete = (lt: LeaveType) => { setDeletingType(lt); setDeleteError(null); };
  const doDelete = async () => {
    if (!deletingType) return;
    setDeleteLoading(true); setDeleteError(null);
    const { error } = await createClient().from("leave_types").delete().eq("id", deletingType.id);
    if (error) { setDeleteError(error.message); }
    else { setLeaveTypes((p) => p.filter((t) => t.id !== deletingType.id)); setDeletingType(null); }
    setDeleteLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Leave Types</h2>
            <p className="text-muted-foreground">Configure available leave types, entitlements, and rules</p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Leave Type
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left font-medium py-3 px-4">Leave Type</th>
                <th className="text-center font-medium py-3 px-4">Days/Year</th>
                <th className="text-center font-medium py-3 px-4">Paid</th>
                <th className="text-center font-medium py-3 px-4">Half-day</th>
                <th className="text-center font-medium py-3 px-4">Carryover</th>
                <th className="text-center font-medium py-3 px-4">Notice (d)</th>
                <th className="text-center font-medium py-3 px-4">Gender</th>
                <th className="text-center font-medium py-3 px-4">Status</th>
                <th className="text-center font-medium py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {leaveTypes.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No leave types configured.</td></tr>
              ) : leaveTypes.map((lt) => (
                <tr key={lt.id} className="border-b border-border hover:bg-muted/30">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLOR_HEX[lt.color] ?? COLOR_HEX.blue }} />
                      <div>
                        <p className="font-medium">{lt.leave_name}</p>
                        <p className="text-xs text-muted-foreground">{lt.leave_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">{lt.max_days_per_year || "—"}</td>
                  <td className="py-3 px-4 text-center">{lt.is_paid ? "✓" : "—"}</td>
                  <td className="py-3 px-4 text-center">{lt.half_day_allowed ? "✓" : "—"}</td>
                  <td className="py-3 px-4 text-center">{lt.carryover_allowed ? `✓ (max ${lt.max_carryover})` : "—"}</td>
                  <td className="py-3 px-4 text-center">{lt.advance_notice_days || "—"}</td>
                  <td className="py-3 px-4 text-center capitalize">{lt.gender_restriction === "all" ? "any" : lt.gender_restriction}</td>
                  <td className="py-3 px-4 text-center">
                    <Badge className={`text-xs ${lt.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {lt.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(lt)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => confirmDelete(lt)} className="text-muted-foreground hover:text-red-600 p-1 rounded hover:bg-red-50" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delete Modal ─────────────────────────────────────────────────────── */}
      {deletingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Delete leave type</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Delete <span className="font-medium text-foreground">{deletingType.leave_name}</span>? This will fail if any leave requests or balances reference this type.
                  </p>
                </div>
              </div>
              {deleteError && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{deleteError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setDeletingType(null)} disabled={deleteLoading}>Cancel</Button>
              <Button onClick={doDelete} disabled={deleteLoading} className="bg-red-600 hover:bg-red-700 text-white">
                {deleteLoading ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Form Modal ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative bg-background rounded-xl shadow-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background rounded-t-xl z-10">
              <h3 className="text-base font-semibold">{editingType ? "Edit leave type" : "Add leave type"}</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Name</label>
                  <input className={inputCls} value={form.leave_name} onChange={(e) => set("leave_name", e.target.value)} placeholder="e.g. Annual Leave" />
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full flex-shrink-0 border border-border" style={{ backgroundColor: COLOR_HEX[form.color] ?? COLOR_HEX.blue }} />
                    <select className={cn(inputCls, "flex-1")} value={form.color} onChange={(e) => set("color", e.target.value)}>
                      {COLOR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Code</label>
                  <input className={inputCls} value={form.leave_code} onChange={(e) => set("leave_code", e.target.value.toUpperCase())} placeholder="e.g. ANNUAL" disabled={!!editingType} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Days per year</label>
                  <input type="number" min={0} className={inputCls} value={form.max_days_per_year} onChange={(e) => set("max_days_per_year", Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Carry-forward max</label>
                  <input type="number" min={0} className={inputCls} value={form.max_carryover} onChange={(e) => set("max_carryover", Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Max days per request</label>
                  <input type="number" min={0} className={inputCls} value={form.max_days_per_request} onChange={(e) => set("max_days_per_request", Number(e.target.value))} placeholder="0 = unlimited" />
                </div>
                <div>
                  <label className={labelCls}>Advance notice (days)</label>
                  <input type="number" min={0} className={inputCls} value={form.advance_notice_days} onChange={(e) => set("advance_notice_days", Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Cancel window (days after submission)</label>
                <input type="number" min={0} className={inputCls} value={form.cancel_window_days} onChange={(e) => set("cancel_window_days", Number(e.target.value))} />
                <p className="mt-1 text-xs text-muted-foreground">Set 0 to disable cancellation.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Gender restriction</label>
                  <select className={inputCls} value={form.gender_restriction} onChange={(e) => set("gender_restriction", e.target.value)}>
                    <option value="all">any</option>
                    <option value="male">male</option>
                    <option value="female">female</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Deduct from</label>
                  <select className={inputCls} value={form.deduct_from_type_id ?? ""} onChange={(e) => set("deduct_from_type_id", e.target.value || null)}>
                    <option value="">balance</option>
                    {leaveTypes.filter((lt) => lt.id !== editingType?.id).map((lt) => (
                      <option key={lt.id} value={lt.id}>{lt.leave_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 pt-1">
                {([
                  ["probation_required", "Probation required"],
                  ["requires_document", "Document required"],
                  ["half_day_allowed", "Half-day allowed"],
                  ["skip_team_capacity", "Skip capacity check"],
                  ["monthly_accrual", "Monthly accrual"],
                  ["seniority_based", "Seniority based"],
                  ["is_replacement_leave", "Replacement leave"],
                  ["is_paid", "Paid"],
                  ["is_active", "Active"],
                ] as [keyof LeaveTypeForm, string][]).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{label}</span>
                    <Toggle checked={form[key] as boolean} onChange={(v) => set(key, v as LeaveTypeForm[typeof key])} />
                  </div>
                ))}
              </div>
              {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border sticky bottom-0 bg-background rounded-b-xl">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
