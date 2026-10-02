"use client";

import { useEffect, useState } from "react";
import { insertHseRiskAssessment, listHseRiskAssessments, updateHseRiskAssessmentById } from "@/lib/construction/construction-queries";
import { Plus, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const STATUSES = ["draft","reviewed","approved","superseded"];
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700", superseded: "bg-yellow-100 text-yellow-700",
};

export function HseRiskAssessments() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [assessNumber, setAssessNumber] = useState("");
  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState("");
  const [location, setLocation] = useState("");
  const [assessor, setAssessor] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await listHseRiskAssessments();
    if (error) toast.error(error.message); else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setAssessNumber(""); setTitle(""); setActivity(""); setLocation(""); setAssessor(""); setReviewDate(""); setStatus("draft"); setNotes("");
    setEditing(null);
  }

  function openEdit(r: any) {
    setAssessNumber(r.assessment_number); setTitle(r.title); setActivity(r.activity || "");
    setLocation(r.location || ""); setAssessor(r.assessor || ""); setReviewDate(r.review_date?.slice(0, 10) || "");
    setStatus(r.status); setNotes(r.notes || "");
    setEditing(r); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      assessment_number: assessNumber, title, activity: activity || null,
      location: location || null, assessor: assessor || null,
      review_date: reviewDate || null, status, notes: notes || null,
    };
    const { error } = editing
      ? await updateHseRiskAssessmentById(payload, editing.id)
      : await insertHseRiskAssessment({ ...payload, project_id: crypto.randomUUID() });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r => !search || r.title?.toLowerCase().includes(search.toLowerCase()) || r.assessment_number?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search assessments..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "New Assessment"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>RA # *</Label><Input value={assessNumber} onChange={e => setAssessNumber(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Activity</Label><Input value={activity} onChange={e => setActivity(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Assessor</Label><Input value={assessor} onChange={e => setAssessor(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Review Date</Label><Input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} /></div>
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
            <th className="px-3 py-2 text-left font-medium">RA#</th>
            <th className="px-3 py-2 text-left font-medium">Title</th>
            <th className="px-3 py-2 text-left font-medium">Activity</th>
            <th className="px-3 py-2 text-left font-medium">Assessor</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-center font-medium">Review By</th>
            <th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{r.assessment_number}</td>
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.activity}</td>
                <td className="px-3 py-2">{r.assessor}</td>
                <td className="px-3 py-2"><Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge></td>
                <td className="px-3 py-2 text-center">{r.review_date?.slice(0, 10)}</td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="py-4 text-center text-sm text-muted-foreground">No risk assessments yet.</p>}
      </div>
    </div>
  );
}
