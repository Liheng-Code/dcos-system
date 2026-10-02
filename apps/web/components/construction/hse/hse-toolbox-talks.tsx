"use client";

import { useEffect, useState } from "react";
import { insertHseToolboxTalk, listHseToolboxTalks, updateHseToolboxTalkById } from "@/lib/construction/construction-queries";
import { Plus, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export function HseToolboxTalks() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [talkDate, setTalkDate] = useState("");
  const [topic, setTopic] = useState("");
  const [presenter, setPresenter] = useState("");
  const [attendees, setAttendees] = useState("");
  const [topicsCovered, setTopicsCovered] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("15");

  async function load() {
    setLoading(true);
    const { data, error } = await listHseToolboxTalks();
    if (error) toast.error(error.message); else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setTalkDate(""); setTopic(""); setPresenter(""); setAttendees(""); setTopicsCovered(""); setNotes(""); setDuration("15");
    setEditing(null);
  }

  function openEdit(r: any) {
    setTalkDate(r.talk_date?.slice(0, 10) || ""); setTopic(r.topic); setPresenter(r.presenter || "");
    setAttendees(r.attendees_count?.toString() || "0"); setTopicsCovered(r.topics_covered || "");
    setNotes(r.notes || ""); setDuration(r.duration_minutes?.toString() || "15");
    setEditing(r); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      talk_date: talkDate, topic, presenter: presenter || null,
      attendees_count: parseInt(attendees) || 0, topics_covered: topicsCovered || null,
      notes: notes || null, duration_minutes: parseInt(duration) || 15,
    };
    const { error } = editing
      ? await updateHseToolboxTalkById(payload, editing.id)
      : await insertHseToolboxTalk({ ...payload, project_id: crypto.randomUUID() });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r => !search || r.topic?.toLowerCase().includes(search.toLowerCase()) || r.presenter?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search topics..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "New Talk"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={talkDate} onChange={e => setTalkDate(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Topic *</Label><Input value={topic} onChange={e => setTopic(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Presenter</Label><Input value={presenter} onChange={e => setPresenter(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Attendees</Label><Input type="number" value={attendees} onChange={e => setAttendees(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={duration} onChange={e => setDuration(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Topics Covered</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={topicsCovered} onChange={e => setTopicsCovered(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Notes</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={notes} onChange={e => setNotes(e.target.value)} /></div>
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
            <th className="px-3 py-2 text-left font-medium">Topic</th>
            <th className="px-3 py-2 text-left font-medium">Presenter</th>
            <th className="px-3 py-2 text-right font-medium">Attendees</th>
            <th className="px-3 py-2 text-right font-medium">Duration</th>
            <th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2">{r.talk_date?.slice(0, 10)}</td>
                <td className="px-3 py-2 font-medium">{r.topic}</td>
                <td className="px-3 py-2">{r.presenter}</td>
                <td className="px-3 py-2 text-right">{r.attendees_count}</td>
                <td className="px-3 py-2 text-right">{r.duration_minutes}min</td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="py-4 text-center text-sm text-muted-foreground">No toolbox talks yet.</p>}
      </div>
    </div>
  );
}
