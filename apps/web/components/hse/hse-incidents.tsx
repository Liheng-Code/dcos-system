"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Loader2, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const INCIDENT_TYPES = ["near_miss","first_aid","medical_treatment","lost_time","fatality","property_damage","environmental"];
const STATUSES = ["reported","investigating","resolved","closed"];
const SEVERITIES = ["minor","moderate","serious","critical"];

const SEVERITY_COLORS: Record<string, string> = {
  minor: "bg-yellow-100 text-yellow-700", moderate: "bg-orange-100 text-orange-700",
  serious: "bg-red-100 text-red-700", critical: "bg-red-200 text-red-900",
};
const STATUS_COLORS: Record<string, string> = {
  reported: "bg-red-100 text-red-700", investigating: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700", closed: "bg-gray-200 text-gray-500",
};

export function HseIncidents() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [incidentNumber, setIncidentNumber] = useState("");
  const [incidentType, setIncidentType] = useState("near_miss");
  const [incidentDate, setIncidentDate] = useState("");
  const [incidentTime, setIncidentTime] = useState("");
  const [location, setLocation] = useState("");
  const [desc, setDesc] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [status, setStatus] = useState("reported");
  const [reportedBy, setReportedBy] = useState("");
  const [affectedPerson, setAffectedPerson] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [preventiveAction, setPreventiveAction] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("hse_incidents").select("*").order("incident_date", { ascending: false }).limit(200);
    if (error) toast.error(error.message); else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setIncidentNumber(""); setIncidentType("near_miss"); setIncidentDate(""); setIncidentTime("");
    setLocation(""); setDesc(""); setImmediateAction(""); setRootCause(""); setSeverity("minor");
    setStatus("reported"); setReportedBy(""); setAffectedPerson(""); setCorrectiveAction(""); setPreventiveAction("");
    setEditing(null);
  }

  function openEdit(r: any) {
    setIncidentNumber(r.incident_number); setIncidentType(r.incident_type);
    setIncidentDate(r.incident_date?.slice(0, 10) || ""); setIncidentTime(r.incident_time?.slice(0, 5) || "");
    setLocation(r.location || ""); setDesc(r.description); setImmediateAction(r.immediate_action || "");
    setRootCause(r.root_cause || ""); setSeverity(r.severity); setStatus(r.status);
    setReportedBy(r.reported_by || ""); setAffectedPerson(r.affected_person || "");
    setCorrectiveAction(r.corrective_action || ""); setPreventiveAction(r.preventive_action || "");
    setEditing(r); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      incident_number: incidentNumber, incident_type: incidentType,
      incident_date: incidentDate, incident_time: incidentTime || null,
      location: location || null, description: desc, immediate_action: immediateAction || null,
      root_cause: rootCause || null, severity, status, reported_by: reportedBy || null,
      affected_person: affectedPerson || null, corrective_action: correctiveAction || null,
      preventive_action: preventiveAction || null,
    };
    const { error } = editing
      ? await supabase.from("hse_incidents").update(payload).eq("id", editing.id)
      : await supabase.from("hse_incidents").insert([{ ...payload, project_id: crypto.randomUUID() }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r => !search || r.incident_number?.toLowerCase().includes(search.toLowerCase()) || r.description?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search incidents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "Report Incident"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Incident # *</Label><Input value={incidentNumber} onChange={e => setIncidentNumber(e.target.value)} required /></div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={incidentType} onChange={e => setIncidentType(e.target.value)}>
                  {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Time</Label><Input type="time" value={incidentTime} onChange={e => setIncidentTime(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={severity} onChange={e => setSeverity(e.target.value)}>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Reported By</Label><Input value={reportedBy} onChange={e => setReportedBy(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Affected Person</Label><Input value={affectedPerson} onChange={e => setAffectedPerson(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Description *</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={desc} onChange={e => setDesc(e.target.value)} required /></div>
              <div className="col-span-2 space-y-1.5"><Label>Immediate Action Taken</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={immediateAction} onChange={e => setImmediateAction(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Root Cause</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={rootCause} onChange={e => setRootCause(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Corrective Action</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Preventive Action</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={preventiveAction} onChange={e => setPreventiveAction(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Report"}</Button>
            </div>
          </form>
        </CardContent></Card>
      )}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Severity</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Reported By</th>
            <th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{r.incident_number}</td>
                <td className="px-3 py-2"><Badge variant="outline">{r.incident_type?.replace(/_/g, " ")}</Badge></td>
                <td className="px-3 py-2">{r.incident_date?.slice(0, 10)}</td>
                <td className="px-3 py-2"><Badge className={SEVERITY_COLORS[r.severity] || ""}>{r.severity}</Badge></td>
                <td className="px-3 py-2"><Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge></td>
                <td className="px-3 py-2">{r.reported_by}</td>
                <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="py-4 text-center text-sm text-muted-foreground">No incidents reported.</p>}
      </div>
    </div>
  );
}
