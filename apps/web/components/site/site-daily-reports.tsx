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

export function SiteDailyReports() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const [reportDate, setReportDate] = useState("");
  const [weather, setWeather] = useState("");
  const [tempLow, setTempLow] = useState("");
  const [tempHigh, setTempHigh] = useState("");
  const [siteConditions, setSiteConditions] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [issues, setIssues] = useState("");
  const [plannedNext, setPlannedNext] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_daily_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setReportDate(""); setWeather(""); setTempLow(""); setTempHigh("");
    setSiteConditions(""); setWorkSummary(""); setIssues(""); setPlannedNext("");
    setEditing(null);
  }

  function openEdit(row: any) {
    setReportDate(row.report_date?.slice(0, 10) || "");
    setWeather(row.weather_conditions || "");
    setTempLow(row.temperature_low?.toString() || "");
    setTempHigh(row.temperature_high?.toString() || "");
    setSiteConditions(row.site_conditions || "");
    setWorkSummary(row.work_summary || "");
    setIssues(row.issues_encountered || "");
    setPlannedNext(row.planned_next_day || "");
    setEditing(row);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      report_date: reportDate,
      weather_conditions: weather || null,
      temperature_low: tempLow ? parseFloat(tempLow) : null,
      temperature_high: tempHigh ? parseFloat(tempHigh) : null,
      site_conditions: siteConditions || null,
      work_summary: workSummary || null,
      issues_encountered: issues || null,
      planned_next_day: plannedNext || null,
    };
    const { error } = editing
      ? await supabase.from("site_daily_reports").update(payload).eq("id", editing.id)
      : await supabase.from("site_daily_reports").insert([{ ...payload, project_id: crypto.randomUUID() }]);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowForm(false); resetForm(); load(); setSaving(false);
  }

  const filtered = rows.filter(r =>
    !search || r.work_summary?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search reports..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { resetForm(); setShowForm(!showForm); }}><Plus className="mr-1 h-4 w-4" />{showForm ? "Cancel" : "New Report"}</Button>
      </div>

      {showForm && (
        <Card><CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Weather</Label><Input value={weather} onChange={e => setWeather(e.target.value)} placeholder="Sunny, cloudy, rainy..." /></div>
              <div className="space-y-1.5"><Label>Temp Low (°C)</Label><Input type="number" value={tempLow} onChange={e => setTempLow(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Temp High (°C)</Label><Input type="number" value={tempHigh} onChange={e => setTempHigh(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Site Conditions</Label><Input value={siteConditions} onChange={e => setSiteConditions(e.target.value)} placeholder="Muddy, dry, wet..." /></div>
              <div className="col-span-2 space-y-1.5"><Label>Work Summary</Label><textarea className="flex h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={workSummary} onChange={e => setWorkSummary(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Issues Encountered</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={issues} onChange={e => setIssues(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Planned Next Day</Label><textarea className="flex h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={plannedNext} onChange={e => setPlannedNext(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Create"}</Button>
            </div>
          </form>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {filtered.map(r => (
          <Card key={r.id}><CardContent className="flex items-center justify-between py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{r.report_date?.slice(0, 10)}</span>
                {r.weather_conditions && <Badge variant="outline">{r.weather_conditions}</Badge>}
              </div>
              {r.work_summary && <p className="text-sm text-muted-foreground line-clamp-2">{r.work_summary}</p>}
              {r.issues_encountered && <p className="text-xs text-red-500">Issues: {r.issues_encountered}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          </CardContent></Card>
        ))}
        {!filtered.length && <p className="text-sm text-muted-foreground py-4 text-center">No reports yet.</p>}
      </div>
    </div>
  );
}
