"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Plus, Loader2, Pencil, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface RfiItem {
  id: string; rfi_no: string; title: string; question: string;
  status: string; priority: string; due_date: string | null;
  discipline: string;
}

const statusColors: Record<string, string> = { open: "bg-blue-100 text-blue-700", answered: "bg-green-100 text-green-700", closed: "bg-gray-100 text-gray-500", cancelled: "bg-red-100 text-red-700" };
const priorityColors: Record<string, string> = { low: "bg-gray-100 text-gray-500", normal: "bg-blue-100 text-blue-700", high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700" };

export function DesignRfiList({ discipline }: { discipline: string }) {
  const supabase = createClient();
  const [items, setItems] = useState<RfiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RfiItem | null>(null);

  function load() {
    setLoading(true);
    supabase.from("design_rfi").select("*").eq("discipline", discipline).order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as RfiItem[]);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter(r => r.rfi_no.toLowerCase().includes(search.toLowerCase()) || r.title.toLowerCase().includes(search.toLowerCase()));

  if (showForm) return <DesignRfiForm discipline={discipline} item={editing} onSaved={() => { setShowForm(false); setEditing(null); load(); }} onCancel={() => { setShowForm(false); setEditing(null); }} />;
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search RFIs..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2"><Plus className="h-4 w-4" /> New RFI</Button>
      </div>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">RFI No</th>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-center px-4 py-2">Priority</th>
              <th className="text-center px-4 py-2">Status</th>
              <th className="text-center px-4 py-2">Due</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No RFIs found.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">{r.rfi_no}</td>
                <td className="px-4 py-2">{r.title}</td>
                <td className="px-4 py-2 text-center"><Badge className={`border-0 text-[10px] ${priorityColors[r.priority] || ""}`}>{r.priority}</Badge></td>
                <td className="px-4 py-2 text-center"><Badge className={`border-0 text-[10px] ${statusColors[r.status] || ""}`}>{r.status}</Badge></td>
                <td className="px-4 py-2 text-center text-muted-foreground text-xs">{r.due_date ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditing(r); setShowForm(true); }}><Pencil className="h-3 w-3" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DesignRfiForm({ discipline, item, onSaved, onCancel }: { discipline: string; item: RfiItem | null; onSaved: () => void; onCancel: () => void }) {
  const supabase = createClient();
  const isNew = !item?.id;
  const [rfiNo, setRfiNo] = useState(item?.rfi_no ?? `RFI-${Date.now()}`);
  const [title, setTitle] = useState(item?.title ?? "");
  const [question, setQuestion] = useState(item?.question ?? "");
  const [priority, setPriority] = useState(item?.priority ?? "normal");
  const [status, setStatus] = useState(item?.status ?? "open");
  const [dueDate, setDueDate] = useState(item?.due_date ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { discipline: item ? item.discipline : discipline, rfi_no: rfiNo, title, question, priority, status, due_date: dueDate || null };
    const { error } = isNew
      ? await supabase.from("design_rfi").insert([payload])
      : await supabase.from("design_rfi").update(payload).eq("id", item!.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(isNew ? "RFI created" : "RFI updated");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-lg font-semibold">{isNew ? "New RFI" : "Edit RFI"}</h2>
      </div>
      <Card><CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>RFI No</Label><Input value={rfiNo} onChange={e => setRfiNo(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
            <div className="col-span-2 space-y-1.5"><Label>Question</Label><textarea className="flex h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={question} onChange={e => setQuestion(e.target.value)} required /></div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={priority} onChange={e => setPriority(e.target.value)}>
                {["low","normal","high","critical"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                {["open","answered","closed","cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
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
