"use client";

import { useEffect, useState } from "react";
import { insertDesignCoordinationLog, listDesignCoordinationLog } from "@/lib/design/design-queries";
import { Search, Plus, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface CoordItem {
  id: string; discipline_from: string; discipline_to: string;
  subject: string; status: string; priority: string;
  due_date: string | null;
}

const statusColors: Record<string, string> = { open: "bg-blue-100 text-blue-700", in_progress: "bg-yellow-100 text-yellow-700", resolved: "bg-green-100 text-green-700", closed: "bg-gray-100 text-gray-500", cancelled: "bg-red-100 text-red-700" };

export function DesignCoordinationLog() {
  const [items, setItems] = useState<CoordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    listDesignCoordinationLog().then(({ data }) => {
      if (data) setItems(data as CoordItem[]);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter(c => c.subject.toLowerCase().includes(search.toLowerCase()));

  if (showForm) return <CoordinationForm onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />;
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> New Item</Button>
      </div>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase">
              <th className="text-left px-4 py-2">Subject</th>
              <th className="text-center px-4 py-2">From</th>
              <th className="text-center px-4 py-2">To</th>
              <th className="text-center px-4 py-2">Priority</th>
              <th className="text-center px-4 py-2">Status</th>
              <th className="text-center px-4 py-2">Due</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No coordination items.</td></tr>
            : filtered.map(c => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2">{c.subject}</td>
                <td className="px-4 py-2 text-center text-xs uppercase font-mono">{c.discipline_from}</td>
                <td className="px-4 py-2 text-center text-xs uppercase font-mono">{c.discipline_to}</td>
                <td className="px-4 py-2 text-center"><Badge variant="outline" className="text-[10px]">{c.priority}</Badge></td>
                <td className="px-4 py-2 text-center"><Badge className={`border-0 text-[10px] ${statusColors[c.status] || ""}`}>{c.status}</Badge></td>
                <td className="px-4 py-2 text-center text-xs text-muted-foreground">{c.due_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoordinationForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [disciplineFrom, setDisciplineFrom] = useState("arc");
  const [disciplineTo, setDisciplineTo] = useState("str");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await insertDesignCoordinationLog({
      project_id: crypto.randomUUID(), discipline_from: disciplineFrom,
      discipline_to: disciplineTo, subject, description: description.trim() || null,
      priority, due_date: dueDate || null, status: "open",
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Coordination item created");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-lg font-semibold">New Coordination Item</h2>
      </div>
      <Card><CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>From Discipline</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={disciplineFrom} onChange={e => setDisciplineFrom(e.target.value)}>
                <option value="arc">Architecture</option><option value="str">Structure</option><option value="mep">MEP</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>To Discipline</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={disciplineTo} onChange={e => setDisciplineTo(e.target.value)}>
                <option value="arc">Architecture</option><option value="str">Structure</option><option value="mep">MEP</option>
              </select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>Subject</Label><Input value={subject} onChange={e => setSubject(e.target.value)} required /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><textarea className="flex h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </div>
        </form>
      </CardContent></Card>
    </div>
  );
}
