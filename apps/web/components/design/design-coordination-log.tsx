"use client";

import { useEffect, useMemo, useState } from "react";
import { insertDesignCoordinationLog, listDesignCoordinationLog, updateDesignCoordinationLog } from "@/lib/design/design-queries";
import { getChipOptionsByIds, searchCoordinationItems } from "@/lib/planning/public";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { Search, Plus, Loader2, ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LinkPicker, type LinkOption, type ScheduleLink } from "./generic-schedule";

interface CoordItem {
  id: string; discipline_from: string; discipline_to: string;
  subject: string; description: string | null; status: string; priority: string;
  due_date: string | null; coordination_item_id: string | null;
}

const statusColors: Record<string, string> = { open: "bg-blue-100 text-blue-700", in_progress: "bg-yellow-100 text-yellow-700", resolved: "bg-green-100 text-green-700", closed: "bg-gray-100 text-gray-500", cancelled: "bg-red-100 text-red-700" };
const STATUSES = [["open", "Open"], ["in_progress", "In Progress"], ["resolved", "Resolved"], ["closed", "Closed"], ["cancelled", "Cancelled"]] as const;
const SELECT_CLS = "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";

/** Planning coordination disciplines that map onto this log's arc / str / mep. */
const DISCIPLINE_CODE: Record<string, string> = { Architectural: "arc", Structural: "str", MEP: "mep" };

/** Planning coordination item (Activity Database) a log entry addresses. */
const COORDINATION_LINK: ScheduleLink = {
  key: "coordination_item_id",
  label: "Planning Coordination Item",
  source: "From the Planning Activity Database (Coordination). Picking one fills an empty subject.",
  search: async (q) => (await searchCoordinationItems(createClient(), q, 30)).map((c) => ({
    id: c.id, label: `${c.code} — ${c.name}`, detail: c.discipline ?? undefined,
    fill: { subject: c.name, ...(c.discipline && DISCIPLINE_CODE[c.discipline] ? { discipline_to: DISCIPLINE_CODE[c.discipline] } : {}) },
  })),
  labels: async (ids) => new Map([...(await getChipOptionsByIds(createClient(), "coordination", ids))].map(([id, o]) => [id, `${o.code} — ${o.name}`])),
};

export function DesignCoordinationLog() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [items, setItems] = useState<CoordItem[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CoordItem | "new" | null>(null);

  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!selectedProjectId) return;
    let live = true;
    (async () => {
      const { data, error } = await listDesignCoordinationLog(selectedProjectId);
      if (!live) return;
      if (error) toast.error(error.message);
      const rows = (data ?? []) as CoordItem[];
      setItems(rows);
      const ids = rows.map((r) => r.coordination_item_id).filter((v): v is string => !!v);
      const found = ids.length ? await COORDINATION_LINK.labels(ids).catch(() => new Map<string, string>()) : new Map<string, string>();
      if (live) { setLabels(found); setLoading(false); }
    })();
    return () => { live = false; };
  }, [selectedProjectId, reloadTick]);

  const filtered = items.filter((c) => `${c.subject} ${labels.get(c.coordination_item_id ?? "") ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  if (projectLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!selectedProjectId) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Select a project to see its coordination log.</p>;
  if (editing) {
    return (
      <CoordinationForm
        projectId={selectedProjectId} item={editing === "new" ? null : editing} labels={labels}
        onSaved={() => { setEditing(null); setReloadTick((n) => n + 1); }} onCancel={() => setEditing(null)}
      />
    );
  }
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => setEditing("new")} className="gap-2"><Plus className="h-4 w-4" /> New Item</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold uppercase text-muted-foreground">
              <th className="px-4 py-2 text-left">Subject</th>
              <th className="px-4 py-2 text-left">Planning Item</th>
              <th className="px-4 py-2 text-center">From</th>
              <th className="px-4 py-2 text-center">To</th>
              <th className="px-4 py-2 text-center">Priority</th>
              <th className="px-4 py-2 text-center">Status</th>
              <th className="px-4 py-2 text-center">Due</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No coordination items.</td></tr>
            : filtered.map((c) => (
              <tr key={c.id} className="border-b transition-colors last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2">{c.subject}</td>
                <td className="max-w-48 truncate px-4 py-2 text-xs text-muted-foreground">{c.coordination_item_id ? labels.get(c.coordination_item_id) ?? "Linked" : "—"}</td>
                <td className="px-4 py-2 text-center font-mono text-xs uppercase">{c.discipline_from}</td>
                <td className="px-4 py-2 text-center font-mono text-xs uppercase">{c.discipline_to}</td>
                <td className="px-4 py-2 text-center"><Badge variant="outline" className="text-[10px]">{c.priority}</Badge></td>
                <td className="px-4 py-2 text-center"><Badge className={`border-0 text-[10px] ${statusColors[c.status] || ""}`}>{c.status.replace("_", " ")}</Badge></td>
                <td className="px-4 py-2 text-center text-xs text-muted-foreground">{c.due_date ?? "—"}</td>
                <td className="px-4 py-2 text-right"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(c)} aria-label="Edit"><Pencil className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoordinationForm({ projectId, item, labels, onSaved, onCancel }: {
  projectId: string; item: CoordItem | null; labels: Map<string, string>; onSaved: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    discipline_from: item?.discipline_from ?? "arc", discipline_to: item?.discipline_to ?? "str", subject: item?.subject ?? "",
    description: item?.description ?? "", priority: item?.priority ?? "normal", due_date: item?.due_date ?? "", status: item?.status ?? "open",
    coordination_item_id: item?.coordination_item_id ?? "",
  });
  const [linkLabel, setLinkLabel] = useState<string | null>(item?.coordination_item_id ? labels.get(item.coordination_item_id) ?? null : null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const db = useMemo(() => createClient(), []);

  function pick(o: LinkOption) {
    setLinkLabel(o.label);
    setForm((p) => {
      const next = { ...p, coordination_item_id: o.id };
      if (!p.subject.trim() && o.fill?.subject) next.subject = o.fill.subject;
      if (!item && o.fill?.discipline_to) next.discipline_to = o.fill.discipline_to;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const row = {
      discipline_from: form.discipline_from, discipline_to: form.discipline_to, subject: form.subject.trim(), description: form.description.trim() || null,
      priority: form.priority, due_date: form.due_date || null, status: form.status, coordination_item_id: form.coordination_item_id || null,
      ...(form.status === "resolved" && item?.status !== "resolved" ? { resolved_at: new Date().toISOString() } : {}),
    };
    const { error } = item
      ? await updateDesignCoordinationLog(item.id, row)
      : await insertDesignCoordinationLog({ ...row, project_id: projectId, created_by: (await db.auth.getUser()).data.user?.id ?? null });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(item ? "Coordination item updated" : "Coordination item created");
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <h2 className="text-lg font-semibold">{item ? "Edit Coordination Item" : "New Coordination Item"}</h2>
      </div>
      <Card><CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{COORDINATION_LINK.label} (optional)</Label>
            <LinkPicker
              link={COORDINATION_LINK} value={form.coordination_item_id} label={linkLabel}
              onPick={pick} onClear={() => { set("coordination_item_id", ""); setLinkLabel(null); }}
            />
            <p className="text-xs text-muted-foreground">{COORDINATION_LINK.source}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>From Discipline</Label>
              <select className={SELECT_CLS} value={form.discipline_from} onChange={(e) => set("discipline_from", e.target.value)}>
                <option value="arc">Architecture</option><option value="str">Structure</option><option value="mep">MEP</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>To Discipline</Label>
              <select className={SELECT_CLS} value={form.discipline_to} onChange={(e) => set("discipline_to", e.target.value)}>
                <option value="arc">Architecture</option><option value="str">Structure</option><option value="mep">MEP</option>
              </select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>Subject *</Label><Input value={form.subject} onChange={(e) => set("subject", e.target.value)} required /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><textarea className={`${SELECT_CLS} h-24`} value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <select className={SELECT_CLS} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className={SELECT_CLS} value={form.status} onChange={(e) => set("status", e.target.value)}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.subject.trim()}>{saving ? "Saving..." : item ? "Update" : "Create"}</Button>
          </div>
        </form>
      </CardContent></Card>
    </div>
  );
}
