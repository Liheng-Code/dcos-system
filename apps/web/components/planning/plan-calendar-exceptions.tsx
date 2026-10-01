"use client";

import { useEffect, useState } from "react";
import { deletePlanCalendarExceptionById, insertPlanCalendarException, listPlanCalendarExceptionsByCalendarId, listPlanCalendarsByProjectId } from "@/lib/planning/planning-queries";
import { Plus, Loader2, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export function PlanCalendarExceptions() {
  const { selectedProjectId } = useProject();
  const [calendars, setCalendars] = useState<any[]>([]);
  const [selectedCalId, setSelectedCalId] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [exceptionDate, setExceptionDate] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setSelectedCalId("");
    if (!selectedProjectId) { setCalendars([]); return; }
    listPlanCalendarsByProjectId(selectedProjectId, "id, name").then(({ data }) => {
      if (data) setCalendars(data);
    });
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedCalId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    listPlanCalendarExceptionsByCalendarId(selectedCalId).then(({ data, error }) => {
      if (error) toast.error(error.message);
      else setRows(data || []);
      setLoading(false);
    });
  }, [selectedCalId]);

  function resetForm() { setExceptionDate(""); setIsWorking(false); setReason(""); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCalId) return;
    setSaving(true);
    const { error } = await insertPlanCalendarException({
      calendar_id: selectedCalId, exception_date: exceptionDate, is_working: isWorking, reason: reason || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Exception added");
    resetForm();
    const { data } = await listPlanCalendarExceptionsByCalendarId(selectedCalId);
    if (data) setRows(data);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await deletePlanCalendarExceptionById(id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      setRows(prev => prev.filter(r => r.id !== id));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="shrink-0">Calendar</Label>
        <select className="flex h-10 w-64 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={selectedCalId} onChange={e => setSelectedCalId(e.target.value)}>
          <option value="">Select a calendar...</option>
          {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {selectedCalId && (
        <>
          <Card><CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={exceptionDate} onChange={e => setExceptionDate(e.target.value)} required /></div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={isWorking ? "working" : "holiday"} onChange={e => setIsWorking(e.target.value === "working")}>
                    <option value="holiday">Holiday / Non-working</option>
                    <option value="working">Extra Working Day</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. National holiday, weather shutdown..." /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add Exception"}</Button>
              </div>
            </form>
          </CardContent></Card>

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{r.exception_date?.slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.is_working ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {r.is_working ? "Working" : "Holiday"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.reason}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !rows.length && <p className="text-sm text-muted-foreground py-4 text-center">No exceptions for this calendar.</p>}
            {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
          </div>
        </>
      )}
    </div>
  );
}
