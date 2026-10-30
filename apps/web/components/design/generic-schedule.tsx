"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Link2, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProject } from "@/components/dashboard/project-context";
import { createClient } from "@/lib/supabase/client";

export interface ScheduleField {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea";
  width?: "full";
  /** Fixed choices (for columns with a CHECK constraint); shown as a select. */
  options?: { value: string; label: string }[];
  required?: boolean;
}

/** One pick in a library link (Planning catalogue or QS cost library). `fill` = form values it suggests. */
export interface LinkOption { id: string; label: string; detail?: string; fill?: Record<string, string> }

/** A record's link to a library item, e.g. a commissioning record to its Planning T&C item. */
export interface ScheduleLink {
  key: string;
  label: string;
  /** Where the library lives, shown under the picker. */
  source: string;
  search: (q: string) => Promise<LinkOption[]>;
  /** Display labels of linked ids (for the table and the edit form). */
  labels: (ids: string[]) => Promise<Map<string, string>>;
}

export interface TableConfig {
  title: string;
  table: string;
  orderField: string;
  fields: ScheduleField[];
  link?: ScheduleLink;
}

type Row = Record<string, unknown> & { id: string };

const INPUT_CLS = "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";

export function LinkPicker({ link, value, label, onPick, onClear }: {
  link: ScheduleLink; value: string; label: string | null; onPick: (o: LinkOption) => void; onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; rows: LinkOption[] } | null>(null);
  useEffect(() => {
    if (value) return;
    let live = true;
    const t = setTimeout(() => {
      link.search(q.trim())
        .then((rows) => { if (live) setResults({ q, rows }); })
        .catch(() => { if (live) setResults({ q, rows: [] }); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [link, q, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5"><Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{label ?? "Linked"}</span></span>
        <button type="button" onClick={onClear} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Remove link"><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by code or name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-44 overflow-auto rounded-md border border-input">
        {results?.q !== q ? (
          <div className="flex items-center gap-1.5 p-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Searching…</div>
        ) : results.rows.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">Nothing found.</p>
        ) : results.rows.map((o) => (
          <button key={o.id} type="button" onClick={() => onPick(o)} className="flex w-full items-baseline justify-between gap-2 border-b border-border/60 px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-muted/60">
            <span className="min-w-0 truncate">{o.label}</span>
            {o.detail && <span className="shrink-0 text-xs text-muted-foreground">{o.detail}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A project's records of one Design schedule table: list, search, create and edit. */
export function GenericSchedule({ config }: { config: TableConfig }) {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [linkLabels, setLinkLabels] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const link = config.link;

  const [reloadTick, setReloadTick] = useState(0);
  const load = () => setReloadTick((n) => n + 1);

  useEffect(() => {
    if (!selectedProjectId) return;
    let live = true;
    (async () => {
      const { data, error } = await db.from(config.table).select("*").eq("project_id", selectedProjectId).order(config.orderField);
      if (!live) return;
      if (error) toast.error(error.message);
      const rows = (data ?? []) as Row[];
      setItems(rows);
      if (link) {
        const ids = rows.map((r) => r[link.key]).filter((v): v is string => typeof v === "string");
        const labels = ids.length ? await link.labels(ids).catch(() => new Map<string, string>()) : new Map<string, string>();
        if (live) setLinkLabels(labels);
      }
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [db, config.table, config.orderField, link, selectedProjectId, reloadTick]);

  const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const optionLabel = (f: ScheduleField, v: unknown) => f.options?.find((o) => o.value === v)?.label ?? text(v);
  const filtered = items.filter((r) =>
    config.fields.some((f) => optionLabel(f, r[f.key]).toLowerCase().includes(search.toLowerCase()))
    || (link && (linkLabels.get(text(r[link.key])) ?? "").toLowerCase().includes(search.toLowerCase())));

  function openForm(item: Row | null) {
    setEditing(item);
    const keys = [...config.fields.map((f) => f.key), ...(link ? [link.key] : [])];
    setFormData(Object.fromEntries(keys.map((k) => [k, item ? text(item[k]) : ""])));
    setShowForm(true);
  }

  function pickLink(o: LinkOption) {
    if (!link) return;
    setLinkLabels((m) => new Map(m).set(o.id, o.label));
    // Suggested values fill only the fields that are still empty.
    setFormData((prev) => {
      const next = { ...prev, [link.key]: o.id };
      for (const [k, v] of Object.entries(o.fill ?? {})) if (!next[k]) next[k] = v;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) return;
    const payload: Record<string, unknown> = {};
    for (const f of config.fields) {
      const v = (formData[f.key] ?? "").trim();
      if (f.type === "number" && v !== "" && Number.isNaN(Number(v))) { toast.error(`${f.label} must be a number`); return; }
      // A blank field is left out of a new row so the column default applies (e.g. status 'draft'); on edit it is cleared.
      if (v === "" && !editing) continue;
      payload[f.key] = v === "" ? null : f.type === "number" ? Number(v) : v;
    }
    if (link) payload[link.key] = formData[link.key] || null;
    setSaving(true);
    const { error } = editing
      ? await db.from(config.table).update(payload).eq("id", editing.id)
      : await db.from(config.table).insert([{ ...payload, project_id: selectedProjectId, created_by: (await db.auth.getUser()).data.user?.id ?? null }]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false);
    load();
  }

  if (projectLoading) return <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin" />;
  if (!selectedProjectId) {
    return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Select a project to see its {config.title.toLowerCase()} records.</p>;
  }

  if (showForm) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button><h2 className="text-lg font-semibold">{editing ? `Edit ${config.title}` : `New ${config.title}`}</h2></div>
      <Card><CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          {link && (
            <div className="space-y-1.5">
              <Label>{link.label} (optional)</Label>
              <LinkPicker
                link={link} value={formData[link.key] ?? ""} label={linkLabels.get(formData[link.key] ?? "") ?? null}
                onPick={pickLink} onClear={() => setFormData((prev) => ({ ...prev, [link.key]: "" }))}
              />
              <p className="text-xs text-muted-foreground">{link.source}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {config.fields.map((f) => (
              <div key={f.key} className={f.width === "full" || f.type === "textarea" ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
                <Label>{f.label}{f.required && " *"}</Label>
                {f.options ? (
                  <select className={INPUT_CLS} value={formData[f.key] ?? ""} required={f.required} onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}>
                    {(!editing || editing[f.key] == null) && <option value="">{editing ? "—" : "— (default)"}</option>}
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea className={`${INPUT_CLS} h-20`} value={formData[f.key] ?? ""} onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))} />
                ) : (
                  <Input type={f.type ?? "text"} required={f.required} value={formData[f.key] ?? ""} onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{editing ? "Update" : "Create"}</Button>
          </div>
        </form>
      </CardContent></Card>
    </div>
  );

  if (loading) return <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={() => openForm(null)} className="gap-2"><Plus className="h-4 w-4" /> New</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {config.fields.map((f) => <th key={f.key} className="px-3 py-2 text-left">{f.label}</th>)}
            {link && <th className="px-3 py-2 text-left">{link.label}</th>}
            <th className="px-3 py-2 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={config.fields.length + (link ? 2 : 1)} className="py-8 text-center text-muted-foreground">No records found.</td></tr>
            : filtered.map((r) => (
              <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-muted/20">
                {config.fields.map((f) => (
                  <td key={f.key} className="px-3 py-2 text-xs">{f.type === "number" && r[f.key] != null ? Number(r[f.key]).toFixed(2) : optionLabel(f, r[f.key]) || "—"}</td>
                ))}
                {link && <td className="max-w-56 truncate px-3 py-2 text-xs text-muted-foreground">{linkLabels.get(text(r[link.key])) ?? "—"}</td>}
                <td className="px-3 py-2 text-right"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(r)} aria-label="Edit"><Pencil className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
