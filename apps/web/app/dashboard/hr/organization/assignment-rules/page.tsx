"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssignmentRule, ProvisionAction } from "@/lib/hr/assignment-rules";
import {
  deleteHrAssignmentRuleById,
  insertHrAssignmentRule,
  listCompanies,
  listDepartments,
  listEmployeeMasterListItems,
  listHrAssignmentRules,
  listPositions,
  listSiteLocations,
  listWorkShifts,
  updateHrAssignmentRuleById,
} from "@/lib/hr/hr-queries";
import type { ProvisionApplyResult, ProvisionPreviewRow } from "@/lib/hr/provisioning";

interface Option { value: string; label: string }
interface Lookups {
  employment_type: Option[];
  employment_category: Option[];
  labor_category: Option[];
  leave_group: Option[];
  payroll_group: Option[];
  department: Option[];
  position: Option[];
  company: Option[];
  shift: Option[];
  site: Option[];
}

// Form values are strings; "" means "any" (match columns) or "leave unchanged" (outputs).
type Form = Record<
  | "name" | "priority" | "m_employment_type" | "m_employment_category" | "m_labor_category"
  | "m_department_id" | "m_position_id" | "m_company_id" | "leave_group" | "payroll_group"
  | "shift_id" | "default_site_id" | "ot_eligible" | "tax_applicable" | "nssf_applicable"
  | "payroll_type" | "currency" | "note",
  string
>;

const EMPTY_FORM: Form = {
  name: "", priority: "100", m_employment_type: "", m_employment_category: "", m_labor_category: "",
  m_department_id: "", m_position_id: "", m_company_id: "", leave_group: "", payroll_group: "",
  shift_id: "", default_site_id: "", ot_eligible: "", tax_applicable: "", nssf_applicable: "",
  payroll_type: "", currency: "", note: "",
};

const ACTION_LABEL: Record<ProvisionAction["kind"], string> = {
  profile_fields: "Groups",
  reporting_line: "Reporting line",
  payroll_profile: "Payroll profile",
  tax_profile: "Tax profile",
  nssf_profile: "NSSF profile",
  shift_assignment: "Shift",
  site_assignment: "Site",
};

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const labelCls = "block text-sm font-medium text-foreground mb-1";

const nullable = (v: string) => (v === "" ? null : v);
const triState = (v: string) => (v === "" ? null : v === "true");
const fromTri = (v: boolean | null) => (v === null ? "" : String(v));

function toRow(form: Form) {
  return {
    name: form.name.trim(),
    priority: Number(form.priority) || 100,
    m_employment_type: nullable(form.m_employment_type),
    m_employment_category: nullable(form.m_employment_category),
    m_labor_category: nullable(form.m_labor_category),
    m_department_id: nullable(form.m_department_id),
    m_position_id: nullable(form.m_position_id),
    m_company_id: nullable(form.m_company_id),
    leave_group: nullable(form.leave_group),
    payroll_group: nullable(form.payroll_group),
    shift_id: nullable(form.shift_id),
    default_site_id: nullable(form.default_site_id),
    ot_eligible: triState(form.ot_eligible),
    tax_applicable: triState(form.tax_applicable),
    nssf_applicable: triState(form.nssf_applicable),
    payroll_type: nullable(form.payroll_type),
    currency: nullable(form.currency),
    note: nullable(form.note),
  };
}

function toForm(rule: AssignmentRule): Form {
  return {
    name: rule.name, priority: String(rule.priority),
    m_employment_type: rule.m_employment_type ?? "", m_employment_category: rule.m_employment_category ?? "",
    m_labor_category: rule.m_labor_category ?? "", m_department_id: rule.m_department_id ?? "",
    m_position_id: rule.m_position_id ?? "", m_company_id: rule.m_company_id ?? "",
    leave_group: rule.leave_group ?? "", payroll_group: rule.payroll_group ?? "",
    shift_id: rule.shift_id ?? "", default_site_id: rule.default_site_id ?? "",
    ot_eligible: fromTri(rule.ot_eligible), tax_applicable: fromTri(rule.tax_applicable),
    nssf_applicable: fromTri(rule.nssf_applicable), payroll_type: rule.payroll_type ?? "",
    currency: rule.currency ?? "", note: rule.note ?? "",
  };
}

function SelectField({ label, value, onChange, options, anyLabel = "Any" }: {
  label: string; value: string; onChange: (v: string) => void; options: Option[]; anyLabel?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{anyLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function BoolField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <SelectField
      label={label} value={value} onChange={onChange} anyLabel="Leave unchanged"
      options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
    />
  );
}

export default function AssignmentRulesPage() {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<AssignmentRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ProvisionPreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const set = (key: keyof Form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const loadRules = useCallback(async () => {
    const { data } = await listHrAssignmentRules();
    setRules((data ?? []) as AssignmentRule[]);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const [master, dept, pos, comp, shifts, sites] = await Promise.all([
        listEmployeeMasterListItems(["employment_type", "employment_category", "labor_category", "leave_group", "payroll_group"]),
        listDepartments(), listPositions(), listCompanies(), listWorkShifts(), listSiteLocations(),
      ]);
      const byType = (type: string): Option[] =>
        ((master.data ?? []) as { list_type: string; code: string; name: string }[])
          .filter((m) => m.list_type === type)
          .map((m) => ({ value: m.code, label: m.name }));
      setLookups({
        employment_type: byType("employment_type"),
        employment_category: byType("employment_category"),
        labor_category: byType("labor_category"),
        leave_group: byType("leave_group"),
        payroll_group: byType("payroll_group"),
        department: ((dept.data ?? []) as { id: string; department_name: string }[]).map((d) => ({ value: d.id, label: d.department_name })),
        position: ((pos.data ?? []) as { id: string; position_name: string }[]).map((p) => ({ value: p.id, label: p.position_name })),
        company: ((comp.data ?? []) as { id: string; name: string }[]).map((c) => ({ value: c.id, label: c.name })),
        shift: ((shifts.data ?? []) as { id: string; name: string }[]).map((s) => ({ value: s.id, label: s.name })),
        site: ((sites.data ?? []) as { id: string; name: string }[]).map((s) => ({ value: s.id, label: s.name })),
      });
      await loadRules();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRules]);

  const labelOf = (options: Option[] | undefined, value: string | null) =>
    value ? options?.find((o) => o.value === value)?.label ?? value : null;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(rule: AssignmentRule) {
    setEditing(rule);
    setForm(toForm(rule));
    setFormError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setSaving(true);
    const row = toRow(form);
    const { error } = editing ? await updateHrAssignmentRuleById(editing.id, row) : await insertHrAssignmentRule(row);
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setShowForm(false);
    setPreview(null);
    await loadRules();
    toast.success(editing ? "Rule updated" : "Rule created");
  }

  async function toggleActive(rule: AssignmentRule) {
    const { error } = await updateHrAssignmentRuleById(rule.id, { is_active: !rule.is_active });
    if (error) toast.error(error.message);
    else { setPreview(null); await loadRules(); }
  }

  async function remove(rule: AssignmentRule) {
    if (!window.confirm(`Delete rule "${rule.name}"? Records already provisioned from it are kept.`)) return;
    const { error } = await deleteHrAssignmentRuleById(rule.id);
    if (error) toast.error(error.message);
    else { setPreview(null); await loadRules(); }
  }

  async function runPreview() {
    setPreviewing(true);
    const res = await fetch("/api/hr/provisioning");
    const body = await res.json();
    setPreviewing(false);
    if (!res.ok) { toast.error(body.error ?? "Preview failed"); return; }
    setPreview(body.rows);
  }

  async function apply() {
    if (!preview) return;
    const targets = preview.filter((r) => r.actions.length > 0);
    if (!window.confirm(`Create the listed records for ${targets.length} employee(s)? Existing records are never replaced.`)) return;
    setApplying(true);
    const res = await fetch("/api/hr/provisioning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_ids: targets.map((r) => r.employeeId) }),
    });
    const body: ProvisionApplyResult & { error?: string } = await res.json();
    setApplying(false);
    if (!res.ok) { toast.error(body.error ?? "Provisioning failed"); return; }
    const total = Object.values(body.created).reduce((a, b) => a + b, 0);
    if (body.errors.length > 0) toast.error(`${total} records created, ${body.errors.length} failed: ${body.errors[0].message}`);
    else toast.success(`${total} records created for ${body.employees} employee(s)`);
    await runPreview();
  }

  const withActions = preview?.filter((r) => r.actions.length > 0).length ?? 0;
  const withIssues = preview?.filter((r) => r.issues.length > 0).length ?? 0;

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Assignment Rules</h1>
          <p className="text-sm text-muted-foreground">
            Register an employee once in Employee Master. The best-matching rule sets their leave group, payroll group,
            shift, site and payroll, tax and NSSF profiles. Lowest priority number wins; a more specific rule wins a tie.
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> New rule</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Priority</th><th className="p-3">Rule</th><th className="p-3">Matches</th>
                <th className="p-3">Sets</th><th className="p-3">Active</th><th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No rules yet. Create one to start auto-provisioning.</td></tr>
              )}
              {rules.map((r) => {
                const matches = [
                  labelOf(lookups?.employment_type, r.m_employment_type),
                  labelOf(lookups?.employment_category, r.m_employment_category),
                  labelOf(lookups?.labor_category, r.m_labor_category),
                  labelOf(lookups?.department, r.m_department_id),
                  labelOf(lookups?.position, r.m_position_id),
                  labelOf(lookups?.company, r.m_company_id),
                ].filter(Boolean);
                const sets = [
                  r.leave_group && `Leave: ${labelOf(lookups?.leave_group, r.leave_group)}`,
                  r.payroll_group && `Payroll: ${labelOf(lookups?.payroll_group, r.payroll_group)}`,
                  r.shift_id && `Shift: ${labelOf(lookups?.shift, r.shift_id)}`,
                  r.default_site_id && `Site: ${labelOf(lookups?.site, r.default_site_id)}`,
                  r.currency && r.currency,
                ].filter(Boolean);
                return (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="p-3">{r.priority}</td>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3">{matches.length ? matches.map((m) => <Badge key={String(m)} variant="outline" className="mr-1">{m}</Badge>) : <span className="text-muted-foreground">Everyone</span>}</td>
                    <td className="p-3 text-muted-foreground">{sets.join(" · ") || "-"}</td>
                    <td className="p-3"><input type="checkbox" checked={r.is_active} onChange={() => toggleActive(r)} aria-label={`Toggle ${r.name}`} /></td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Preview for current employees</CardTitle>
            <CardDescription>Shows what the rules would create. Nothing is written until you apply.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={runPreview} disabled={previewing || rules.length === 0}>
              {previewing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Run preview
            </Button>
            <Button onClick={apply} disabled={!preview || withActions === 0 || applying}>
              {applying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />} Apply to {withActions}
            </Button>
          </div>
        </CardHeader>
        {preview && (
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {preview.length} active employees · {withActions} would get new records · {withIssues} need HR attention
            </p>
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">Employee</th><th className="p-2">Rule</th><th className="p-2">Would create</th><th className="p-2">Needs attention</th></tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.employeeId} className="border-b last:border-0 align-top">
                    <td className="p-2"><div className="font-medium">{row.fullName ?? "-"}</div><div className="text-xs text-muted-foreground">{row.employeeCode}</div></td>
                    <td className="p-2">{row.rule?.name ?? <span className="text-muted-foreground">None matched</span>}</td>
                    <td className="p-2">{row.actions.length ? row.actions.map((a) => <Badge key={a.kind} variant="secondary" className="mr-1">{ACTION_LABEL[a.kind]}</Badge>) : <span className="text-muted-foreground">Nothing to add</span>}</td>
                    <td className="p-2">
                      {row.issues.map((i) => (
                        <div key={i} className="flex items-start gap-1 text-amber-600"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{i}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {showForm && lookups && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-3xl rounded-lg bg-background p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? "Edit rule" : "New rule"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            {formError && <div className="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{formError}</div>}

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Name</label>
                <input className={inputCls} value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Permanent site staff" />
              </div>
              <div>
                <label className={labelCls}>Priority (lower wins)</label>
                <input className={inputCls} type="number" value={form.priority} onChange={(e) => set("priority")(e.target.value)} />
              </div>
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold">Applies to employees where (blank = any)</h3>
            <div className="grid grid-cols-3 gap-3">
              <SelectField label="Employment type" value={form.m_employment_type} onChange={set("m_employment_type")} options={lookups.employment_type} />
              <SelectField label="Employment category" value={form.m_employment_category} onChange={set("m_employment_category")} options={lookups.employment_category} />
              <SelectField label="Labor category" value={form.m_labor_category} onChange={set("m_labor_category")} options={lookups.labor_category} />
              <SelectField label="Department" value={form.m_department_id} onChange={set("m_department_id")} options={lookups.department} />
              <SelectField label="Position" value={form.m_position_id} onChange={set("m_position_id")} options={lookups.position} />
              <SelectField label="Company" value={form.m_company_id} onChange={set("m_company_id")} options={lookups.company} />
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold">Sets (blank = leave unchanged)</h3>
            <div className="grid grid-cols-3 gap-3">
              <SelectField label="Leave group" value={form.leave_group} onChange={set("leave_group")} options={lookups.leave_group} anyLabel="Leave unchanged" />
              <SelectField label="Payroll group" value={form.payroll_group} onChange={set("payroll_group")} options={lookups.payroll_group} anyLabel="Leave unchanged" />
              <SelectField label="Shift" value={form.shift_id} onChange={set("shift_id")} options={lookups.shift} anyLabel="Leave unchanged" />
              <SelectField label="Default site" value={form.default_site_id} onChange={set("default_site_id")} options={lookups.site} anyLabel="Leave unchanged" />
              <SelectField label="Payroll type" value={form.payroll_type} onChange={set("payroll_type")} anyLabel="Leave unchanged"
                options={[{ value: "monthly", label: "Monthly" }, { value: "daily", label: "Daily" }]} />
              <SelectField label="Currency" value={form.currency} onChange={set("currency")} anyLabel="Leave unchanged"
                options={[{ value: "USD", label: "USD" }, { value: "KHR", label: "KHR" }]} />
              <BoolField label="OT eligible" value={form.ot_eligible} onChange={set("ot_eligible")} />
              <BoolField label="Tax applicable" value={form.tax_applicable} onChange={set("tax_applicable")} />
              <BoolField label="NSSF applicable" value={form.nssf_applicable} onChange={set("nssf_applicable")} />
            </div>

            <div className="mt-4">
              <label className={labelCls}>Note</label>
              <input className={inputCls} value={form.note} onChange={(e) => set("note")(e.target.value)} />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
