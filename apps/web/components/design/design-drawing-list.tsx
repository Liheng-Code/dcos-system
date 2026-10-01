"use client";

import { useEffect, useState } from "react";
import { insertDesignDrawing, listDesignDrawings, listDesignDrawingsByDiscipline, updateDesignDrawingById } from "@/lib/design/design-queries";
import { Search, Plus, Loader2, Pencil, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Drawing {
  id: string; project_id: string; wbs_node_id: string | null;
  discipline: string; drawing_no: string; title: string;
  revision: string; status: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700", approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700", ifc: "bg-emerald-100 text-emerald-700",
  superseded: "bg-orange-100 text-orange-700", archived: "bg-slate-100 text-slate-500",
};

export function DesignDrawingList({ discipline }: { discipline: string }) {
  const [items, setItems] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Drawing | null>(null);

  function load() {
    setLoading(true);
    listDesignDrawingsByDiscipline(discipline).then(({ data }) => {
      if (data) setItems(data as Drawing[]);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter(d => d.drawing_no.toLowerCase().includes(search.toLowerCase()) || d.title.toLowerCase().includes(search.toLowerCase()));

  if (showForm) return <DesignDrawingForm discipline={discipline} drawing={editing} onSaved={() => { setShowForm(false); setEditing(null); load(); }} onCancel={() => { setShowForm(false); setEditing(null); }} />;
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search drawings..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2"><Plus className="h-4 w-4" /> New Drawing</Button>
      </div>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">Drawing No</th>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">Revision</th>
              <th className="text-center px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No drawings found.</td></tr>
            ) : filtered.map(d => (
              <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">{d.drawing_no}</td>
                <td className="px-4 py-2">{d.title}</td>
                <td className="px-4 py-2 font-mono text-xs">{d.revision}</td>
                <td className="px-4 py-2 text-center"><Badge className={`border-0 text-[10px] ${statusColors[d.status] || ""}`}>{d.status}</Badge></td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditing(d); setShowForm(true); }}><Pencil className="h-3 w-3" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DesignDrawingForm({ discipline, drawing, onSaved, onCancel }: { discipline: string; drawing: Drawing | null; onSaved: () => void; onCancel: () => void }) {
  const isNew = !drawing?.id;
  const [drawingNo, setDrawingNo] = useState(drawing?.drawing_no ?? "");
  const [title, setTitle] = useState(drawing?.title ?? "");
  const [revision, setRevision] = useState(drawing?.revision ?? "R00");
  const [status, setStatus] = useState(drawing?.status ?? "draft");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { discipline, drawing_no: drawingNo, title, revision, status, project_id: (await listDesignDrawings()).data?.[0]?.project_id || "00000000-0000-0000-0000-000000000000" };
    const { error } = isNew
      ? await insertDesignDrawing({ ...payload, project_id: crypto.randomUUID() })
      : await updateDesignDrawingById({ title, revision, status }, drawing!.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(isNew ? "Drawing created" : "Drawing updated");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-lg font-semibold">{isNew ? "New Drawing" : "Edit Drawing"}</h2>
      </div>
      <Card><CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Drawing No</Label>
              <Input value={drawingNo} onChange={e => setDrawingNo(e.target.value)} required disabled={!isNew} />
            </div>
            <div className="space-y-1.5">
              <Label>Revision</Label>
              <Input value={revision} onChange={e => setRevision(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                {["draft","submitted","under_review","approved","rejected","ifc","superseded","archived"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : isNew ? "Create" : "Update"}</Button>
          </div>
        </form>
      </CardContent></Card>
    </div>
  );
}
