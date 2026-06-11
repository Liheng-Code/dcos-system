"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TrendingUp, Plus, Pencil, Trash2, X, AlertTriangle } from "lucide-react";

interface SeniorityRule {
  id: string;
  leave_type_id: string;
  min_years: number | string;
  max_years: number | string | null;
  days_per_year: number | string;
}
interface LeaveType { id: string; leave_name: string; }
interface RuleForm {
  leave_type_id: string;
  min_years: string;
  max_years: string;
  days_per_year: string;
}

interface ApiError {
  error?: string;
}

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";
const labelCls = "block text-sm font-medium text-foreground mb-1";

function normalizeRule(rule: SeniorityRule): SeniorityRule {
  return {
    ...rule,
    min_years: Number(rule.min_years),
    max_years: rule.max_years === null ? null : Number(rule.max_years),
    days_per_year: Number(rule.days_per_year),
  };
}

export default function SeniorityRulesAdminPage() {
  const [rules, setRules] = useState<SeniorityRule[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<SeniorityRule | null>(null);
  const [form, setForm] = useState<RuleForm>({ leave_type_id: "", min_years: "0", max_years: "", days_per_year: "0" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete modal
  const [deletingRule, setDeletingRule] = useState<SeniorityRule | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = async () => {
    const supabase = createClient();
    const [rulesRes, typesRes] = await Promise.all([
      supabase.from("leave_seniority_rules").select("*").order("min_years"),
      supabase.from("leave_types").select("id, leave_name").order("leave_name"),
    ]);
    setRules(((rulesRes.data || []) as SeniorityRule[]).map(normalizeRule));
    setLeaveTypes(typesRes.data || []);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().then(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openCreate = () => {
    setEditingRule(null);
    setForm({ leave_type_id: leaveTypes[0]?.id ?? "", min_years: "0", max_years: "", days_per_year: "0" });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (rule: SeniorityRule) => {
    setEditingRule(rule);
    setForm({
      leave_type_id: rule.leave_type_id,
      min_years: String(rule.min_years),
      max_years: rule.max_years === null ? "" : String(rule.max_years),
      days_per_year: String(rule.days_per_year),
    });
    setFormError(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.leave_type_id) { setFormError("Leave type is required."); return; }
    const minYears = Number(form.min_years);
    const maxYears = form.max_years.trim() === "" ? null : Number(form.max_years);
    const daysPerYear = Number(form.days_per_year);
    if (!Number.isFinite(minYears) || minYears < 0) { setFormError("Min years must be 0 or greater."); return; }
    if (maxYears !== null && (!Number.isFinite(maxYears) || maxYears < minYears)) { setFormError("Max years must be empty or greater than/equal to min years."); return; }
    if (!Number.isFinite(daysPerYear) || daysPerYear <= 0) { setFormError("Days per year must be greater than 0."); return; }
    setSaving(true);
    setFormError(null);
    const payload = {
      id: editingRule?.id,
      leave_type_id: form.leave_type_id,
      min_years: minYears,
      max_years: maxYears,
      days_per_year: daysPerYear,
    };
    const res = await fetch("/api/hr/leave/seniority-rules", {
      method: editingRule ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({} as ApiError)) as ApiError;
      setFormError(errorBody.error || "The rule was not saved.");
    } else {
      await refresh();
      setEditingRule(null);
      setShowForm(false);
    }
    setSaving(false);
  };

  const confirmDelete = (rule: SeniorityRule) => {
    setDeletingRule(rule);
    setDeleteError(null);
  };

  const doDelete = async () => {
    if (!deletingRule) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const res = await fetch("/api/hr/leave/seniority-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deletingRule.id }),
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({} as ApiError)) as ApiError;
      setDeleteError(errorBody.error || "The rule was not deleted.");
    } else {
      setRules((p) => p.filter((r) => r.id !== deletingRule.id));
      setDeletingRule(null);
    }
    setDeleteLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Seniority Rules</h2>
            <p className="text-muted-foreground">Leave entitlements based on years of service — applies to seniority-based leave types only</p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Rule
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left font-medium py-3 px-4">Leave Type</th>
                <th className="text-center font-medium py-3 px-4">Min Years</th>
                <th className="text-center font-medium py-3 px-4">Max Years</th>
                <th className="text-center font-medium py-3 px-4">Days / Year</th>
                <th className="text-center font-medium py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No seniority rules configured</td></tr>
              ) : rules.map((rule) => {
                const lt = leaveTypes.find((t) => t.id === rule.leave_type_id);
                return (
                  <tr key={rule.id} className="border-b border-border hover:bg-muted/30">
                    <td className="py-3 px-4">{lt?.leave_name || "Unknown"}</td>
                    <td className="py-3 px-4 text-center">{rule.min_years}</td>
                    <td className="py-3 px-4 text-center">{rule.max_years ?? "No limit"}</td>
                    <td className="py-3 px-4 text-center font-bold">{rule.days_per_year}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(rule)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => confirmDelete(rule)} className="text-muted-foreground hover:text-red-600 p-1 rounded hover:bg-red-50" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delete modal ─────────────────────────────────────── */}
      {deletingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Delete seniority rule</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Delete rule for <span className="font-medium text-foreground">{leaveTypes.find((t) => t.id === deletingRule.leave_type_id)?.leave_name || "Unknown"}</span> ({deletingRule.min_years}–{deletingRule.max_years ?? "∞"} years)?
                  </p>
                </div>
              </div>
              {deleteError && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{deleteError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setDeletingRule(null)} disabled={deleteLoading}>Cancel</Button>
              <Button onClick={doDelete} disabled={deleteLoading} className="bg-red-600 hover:bg-red-700 text-white">
                {deleteLoading ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Form modal ───────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative bg-background rounded-xl shadow-2xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background rounded-t-xl z-10">
              <h3 className="text-base font-semibold">{editingRule ? "Edit seniority rule" : "Add seniority rule"}</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelCls}>Leave type</label>
                <select className={inputCls} value={form.leave_type_id} onChange={(e) => setForm((f) => ({ ...f, leave_type_id: e.target.value }))}>
                  <option value="">Select a leave type</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>{lt.leave_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Min years</label>
                  <input type="number" min={0} className={inputCls} value={form.min_years} onChange={(e) => setForm((f) => ({ ...f, min_years: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Max years</label>
                  <input type="number" min={0} className={inputCls} value={form.max_years} onChange={(e) => setForm((f) => ({ ...f, max_years: e.target.value }))} placeholder="Leave empty for no limit" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Days per year</label>
                <input type="number" min={0} step={0.5} className={inputCls} value={form.days_per_year} onChange={(e) => setForm((f) => ({ ...f, days_per_year: e.target.value }))} />
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
