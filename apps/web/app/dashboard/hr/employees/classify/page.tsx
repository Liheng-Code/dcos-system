"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmployeesTabs } from "@/components/hr/employees/employees-tabs";

interface Option { value: string; label: string }
interface Employee {
  id: string;
  employee_id: string | null;
  full_name: string;
  department: string | null;
  job_title: string | null;
  employment_category: string | null;
  labor_category: string | null;
}
type Field = "employment_category" | "labor_category";
type Edits = Record<string, Partial<Record<Field, string | null>>>;

const FIELD_LABEL: Record<Field, string> = { employment_category: "Employment category", labor_category: "Labor category" };
const selectCls = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export default function ClassifyEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [options, setOptions] = useState<Record<Field, Option[]>>({ employment_category: [], labor_category: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [edits, setEdits] = useState<Edits>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [onlyUnclassified, setOnlyUnclassified] = useState(false);
  const [bulk, setBulk] = useState<Record<Field, string>>({ employment_category: "", labor_category: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/hr/employees/classify");
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Could not load employees"); setLoading(false); return; }
    setEmployees(body.employees);
    setOptions(body.options);
    setEdits({});
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const value = (e: Employee, f: Field) => (edits[e.id] && f in edits[e.id] ? edits[e.id][f] ?? "" : e[f] ?? "");
  const isUnclassified = (e: Employee) => !value(e, "employment_category") || !value(e, "labor_category");

  const departments = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort() as string[], [employees]);
  const jobTitles = useMemo(
    () => [...new Set(employees.filter((e) => !department || e.department === department).map((e) => e.job_title).filter(Boolean))].sort() as string[],
    [employees, department],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (department && e.department !== department) return false;
      if (jobTitle && e.job_title !== jobTitle) return false;
      if (onlyUnclassified && !(!value(e, "employment_category") || !value(e, "labor_category"))) return false;
      if (q && !`${e.full_name} ${e.employee_id ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, edits, search, department, jobTitle, onlyUnclassified]);

  const classified = employees.filter((e) => !isUnclassified(e)).length;
  const pending = Object.keys(edits).length;
  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));

  function setField(id: string, field: Field, v: string) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: v === "" ? null : v } }));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function applyBulk() {
    if (selected.size === 0 || (!bulk.employment_category && !bulk.labor_category)) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        next[id] = { ...next[id] };
        if (bulk.employment_category) next[id].employment_category = bulk.employment_category;
        if (bulk.labor_category) next[id].labor_category = bulk.labor_category;
      }
      return next;
    });
    toast.success(`Set on ${selected.size} employee(s). Click Save changes to store them.`);
  }

  async function save() {
    const updates = Object.entries(edits).map(([id, patch]) => ({ id, ...patch }));
    if (updates.length === 0) return;
    setSaving(true);
    const res = await fetch("/api/hr/employees/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(body.error ?? "Save failed"); return; }
    if (body.errors?.length) toast.error(`${body.changed} saved, ${body.errors.length} failed: ${body.errors[0].message}`);
    else toast.success(`${body.changed} employee(s) updated`);
    await load();
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <EmployeesTabs />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Classify Employees</h1>
          <p className="text-sm text-muted-foreground">
            Set employment category and labor category once. Assignment rules match on these, so every employee needs both.
            Tip: filter by department or job title, tick the rows, set the values below, then save.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={classified === employees.length ? "default" : "secondary"}>{classified} of {employees.length} classified</Badge>
          <Button onClick={save} disabled={pending === 0 || saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save changes{pending > 0 ? ` (${pending})` : ""}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="relative col-span-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input className={`${selectCls} pl-8`} placeholder="Search name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={selectCls} value={department} onChange={(e) => { setDepartment(e.target.value); setJobTitle(""); }}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className={selectCls} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}>
              <option value="">All job titles</option>
              {jobTitles.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyUnclassified} onChange={(e) => setOnlyUnclassified(e.target.checked)} /> Only unclassified
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-3">
            <span className="text-sm font-medium">{selected.size} selected → set</span>
            {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
              <select key={f} className={`${selectCls} w-auto min-w-48`} value={bulk[f]} onChange={(e) => setBulk((b) => ({ ...b, [f]: e.target.value }))}>
                <option value="">{FIELD_LABEL[f]}: no change</option>
                {options[f].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}
            <Button variant="outline" onClick={applyBulk} disabled={selected.size === 0 || (!bulk.employment_category && !bulk.labor_category)}>Apply to selected</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-10 p-3">
                  <input
                    type="checkbox" aria-label="Select all shown" checked={allVisibleSelected}
                    onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((e) => e.id)))}
                  />
                </th>
                <th className="p-3">Employee</th><th className="p-3">Department</th><th className="p-3">Job title</th>
                <th className="p-3">Employment category</th><th className="p-3">Labor category</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No employees match the filters.</td></tr>}
              {visible.map((e) => (
                <tr key={e.id} className={`border-b last:border-0 ${edits[e.id] ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                  <td className="p-3"><input type="checkbox" aria-label={`Select ${e.full_name}`} checked={selected.has(e.id)} onChange={() => toggle(e.id)} /></td>
                  <td className="p-3"><div className="font-medium">{e.full_name}</div><div className="text-xs text-muted-foreground">{e.employee_id}</div></td>
                  <td className="p-3 text-muted-foreground">{e.department ?? "-"}</td>
                  <td className="p-3 text-muted-foreground">{e.job_title ?? "-"}</td>
                  {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
                    <td key={f} className="p-3">
                      <select className={selectCls} value={value(e, f) ?? ""} onChange={(ev) => setField(e.id, f, ev.target.value)} aria-label={`${FIELD_LABEL[f]} for ${e.full_name}`}>
                        <option value="">Not set</option>
                        {options[f].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
