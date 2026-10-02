"use client";

import { useEffect, useState } from "react";
import { insertHseObservation, listHseObservations, updateHseObservationById } from "@/lib/construction/construction-queries";
import { Plus, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const OBS_TYPES = ["safe_act","unsafe_act","safe_condition","unsafe_condition"];
const CATEGORIES = ["housekeeping","ppe","equipment","behavior","environmental","other"];

const TYPE_COLORS: Record<string, string> = {
  safe_act: "bg-green-100 text-green-700", unsafe_act: "bg-red-100 text-red-700",
  safe_condition: "bg-teal-100 text-teal-700", unsafe_condition: "bg-orange-100 text-orange-700",
};

export function HseObservations() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [obsDate, setObsDate] = useState("");
  const [observer, setObserver] = useState("");
  const [location, setLocation] = useState("");
  const [obsType, setObsType] = useState("unsafe_act");
  const [desc, setDesc] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [category, setCategory] = useState("other");
  const [status, setStatus] = useState("open");

  async function load() {
    setLoading(true);
    const { data, error } = await listHseObservations();
    if (error) toast.error(error.message); else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setObsDate(""); setObserver(""); setLocation(""); setObsType("unsafe_act");
    setDesc(""); setImmediateAction(""); setCategory("other"); setStatus("open");
    setEditing(null);
  }

  function openEdit(r: any) {
    setObsDate(r.observation_date?.slice(0, 10) || ""); setObserver(r.observer || "");
    setLocation(r.location || ""); setObsType(r.observation_type); setDesc(r.description);
    setImmediateAction(r.immediate_action || ""); setCategory(r.category); setStatus(r.status);
    setEditing(r); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      observation_date: obsDate, observer: observer || null, location: location || null,
      observation_type: obsType, description: desc, immediate_action: immediateAction || null,
      category, status,
    };
    const { error } = editing
      ? await updateHseObservationById(payload, editing.id)
      : await insertHseObservation({ ...payload, project_id: crypto.randomUUID() });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r => !search || r.description?.toLowerCase().includes(search.toLowerCase()) || r.observer?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search observations..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "New Observation"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={obsDate} onChange={e => setObsDate(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Observer</Label><Input value={observer} onChange={e => setObserver(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={obsType} onChange={e => setObsType(e.target.value)}>
                  {OBS_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="open">Open</option><option value="closed">Closed</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Description *</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={desc} onChange={e => setDesc(e.target.value)} required /></div>
              <div className="col-span-2 space-y-1.5"><Label>Immediate Action</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={immediateAction} onChange={e => setImmediateAction(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Create"}</Button>
            </div>
          </form>
        </CardContent></Card>
      )}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Observer</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Category</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2">{r.observation_date?.slice(0, 10)}</td>
                <td className="px-3 py-2">{r.observer}</td>
                <td className="px-3 py-2"><Badge className={TYPE_COLORS[r.observation_type] || ""}>{r.observation_type?.replace(/_/g, " ")}</Badge></td>
                <td className="px-3 py-2"><Badge variant="outline">{r.category}</Badge></td>
                <td className="px-3 py-2">{r.status === "open" ? <Badge className="bg-red-100 text-red-700">Open</Badge> : <Badge className="bg-green-100 text-green-700">Closed</Badge>}</td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="py-4 text-center text-sm text-muted-foreground">No observations yet.</p>}
      </div>
    </div>
  );
}
