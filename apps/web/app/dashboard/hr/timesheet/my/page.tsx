"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listProjects } from "@/lib/hr/hr-queries";

interface Row {
  key: string;
  id?: string;
  entry_date: string;
  project_id: string | null;
  hours_worked: number;
  ot_hours: number;
  task_description: string;
  source?: string;
  dirty: boolean;
}
interface Timesheet { id: string; status: string; total_hours: number; total_ot_hours: number }
interface DayInfo { date: string; status: string; expected: number }
interface Issue { date: string; message: string }

const mondayOf = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
const inputCls = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";
const sum = (rows: Row[]) => Math.round(rows.reduce((s, r) => s + (Number(r.hours_worked) || 0), 0) * 100) / 100;

export default function MyTimesheetPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState<DayInfo[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [projects, setProjects] = useState<{ id: string; project_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const editable = timesheet ? ["draft", "rejected"].includes(timesheet.status) : false;
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(weekStart), i), "yyyy-MM-dd")), [weekStart]);
  const dirty = deleted.length > 0 || rows.some((r) => r.dirty);

  const load = useCallback(async (week: string) => {
    setLoading(true);
    const res = await fetch(`/api/hr/timesheets?scope=mine&week_start=${week}`);
    const body = await res.json();
    const ts = res.ok ? body.timesheets?.[0] : null;
    if (!res.ok) toast.error(body.error ?? "Could not load the timesheet");
    setDeleted([]);
    if (!ts) { setTimesheet(null); setRows([]); setDays([]); setIssues([]); setLoading(false); return; }
    setTimesheet({ id: ts.id, status: ts.status, total_hours: Number(ts.total_hours), total_ot_hours: Number(ts.total_ot_hours) });
    setRows(
      (ts.entries ?? []).map((e: { id: string; entry_date: string; project_id: string | null; hours_worked: number | string; ot_hours: number | string | null; task_description: string | null; source?: string }) => ({
        key: e.id, id: e.id, entry_date: e.entry_date, project_id: e.project_id,
        hours_worked: Number(e.hours_worked), ot_hours: Number(e.ot_hours ?? 0),
        task_description: e.task_description ?? "", source: e.source, dirty: false,
      })),
    );
    const check = await fetch(`/api/hr/timesheets/${ts.id}/check`);
    if (check.ok) {
      const c = await check.json();
      setDays(c?.days ?? []);
      setIssues(c?.issues ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { load(weekStart); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, weekStart]);

  useEffect(() => {
    listProjects().then(({ data }) => setProjects((data ?? []) as { id: string; project_name: string }[]));
  }, []);

  const shift = (weeks: number) => setWeekStart(mondayOf(addDays(parseISO(weekStart), weeks * 7)));

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)));
  }
  function addRow(date: string) {
    setRows((prev) => [...prev, { key: `new-${Date.now()}-${prev.length}`, entry_date: date, project_id: null, hours_worked: 0, ot_hours: 0, task_description: "", dirty: true }]);
  }
  function removeRow(row: Row) {
    if (row.id) setDeleted((d) => [...d, row.id as string]);
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  }

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/hr/timesheets/generate-week", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start_date: weekStart }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.error(body.error ?? "Could not generate"); return; }
    if (body.locked > 0) toast.info("This timesheet is already submitted, so it was not changed.");
    else toast.success(body.kept_manual_days > 0 ? `Generated. ${body.kept_manual_days} day(s) you edited were kept.` : "Generated from attendance");
    await load(weekStart);
  }

  async function save(): Promise<boolean> {
    if (!timesheet) return false;
    setBusy(true);
    const entries = rows.filter((r) => r.dirty).map((r) => ({
      id: r.id, entry_date: r.entry_date, project_id: r.project_id,
      hours_worked: Number(r.hours_worked) || 0, ot_hours: Number(r.ot_hours) || 0, task_description: r.task_description || null,
    }));
    const res = await fetch("/api/hr/timesheets", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timesheet_id: timesheet.id, entries, delete_ids: deleted }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.error(body.error ?? "Save failed"); return false; }
    toast.success("Saved");
    await load(weekStart);
    return true;
  }

  async function submit() {
    if (!timesheet) return;
    if (dirty && !(await save())) return;
    setBusy(true);
    const res = await fetch(`/api/hr/timesheets/${timesheet.id}/submit`, { method: "POST" });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.error(body.error ?? "Submit failed"); return; }
    toast.success(body.issues?.length ? `Submitted with ${body.issues.length} day(s) that differ from attendance` : "Submitted for approval");
    await load(weekStart);
  }

  const dayInfo = (date: string) => days.find((d) => d.date === date);
  const issueFor = (date: string) => issues.find((i) => i.date === date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Timesheet</h2>
          <p className="text-muted-foreground">Hours come from your attendance. Only change the project split.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-44 text-center text-sm font-medium">
            {format(parseISO(weekStart), "dd MMM")} – {format(addDays(parseISO(weekStart), 6), "dd MMM yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={generate} disabled={busy || (timesheet !== null && !editable)}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Generate from attendance
        </Button>
        {timesheet && <Badge variant="secondary">{timesheet.status.toUpperCase()}</Badge>}
        {timesheet && <span className="text-sm text-muted-foreground">{timesheet.total_hours.toFixed(1)} h total · {timesheet.total_ot_hours.toFixed(1)} h OT</span>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={save} disabled={!editable || !dirty || busy}><Save className="mr-1 h-4 w-4" /> Save</Button>
          <Button onClick={submit} disabled={!editable || busy}><Send className="mr-1 h-4 w-4" /> Submit</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !timesheet ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No timesheet for this week yet. Generate it from your attendance.</CardContent></Card>
      ) : (
        dates.map((date) => {
          const dayRows = rows.filter((r) => r.entry_date === date);
          const info = dayInfo(date);
          const issue = issueFor(date);
          const booked = sum(dayRows);
          if (dayRows.length === 0 && !info && !editable) return null;
          return (
            <Card key={date} className={issue ? "border-amber-400" : undefined}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{format(parseISO(date), "EEE dd MMM")}</span>
                    {info && <Badge variant="outline">{info.status.toLowerCase().replace(/_/g, " ")}</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Booked {booked} h{info ? ` · attendance ${info.expected} h` : ""}
                  </div>
                </div>
                {issue && <div className="flex items-center gap-1 text-sm text-amber-600"><AlertTriangle className="h-4 w-4" />{issue.message}</div>}

                {dayRows.map((r) => (
                  <div key={r.key} className="grid grid-cols-12 items-center gap-2">
                    <select className={`${inputCls} col-span-4`} disabled={!editable} value={r.project_id ?? ""} onChange={(e) => update(r.key, { project_id: e.target.value || null })} aria-label="Project">
                      <option value="">No project (overhead)</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                    </select>
                    <input className={`${inputCls} col-span-4`} disabled={!editable} value={r.task_description} onChange={(e) => update(r.key, { task_description: e.target.value })} placeholder="Description" aria-label="Description" />
                    <input className={`${inputCls} col-span-1`} type="number" min={0} max={24} step={0.25} disabled={!editable} value={r.hours_worked} onChange={(e) => update(r.key, { hours_worked: Number(e.target.value) })} aria-label="Hours" />
                    <input className={`${inputCls} col-span-1`} type="number" min={0} max={24} step={0.25} disabled={!editable} value={r.ot_hours} onChange={(e) => update(r.key, { ot_hours: Number(e.target.value) })} aria-label="OT hours" title="OT hours (part of the hours)" />
                    <div className="col-span-1 text-xs text-muted-foreground">{r.source === "auto" && !r.dirty ? "auto" : ""}</div>
                    <div className="col-span-1 text-right">
                      {editable && <Button variant="ghost" size="icon" onClick={() => removeRow(r)} aria-label="Remove entry"><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </div>
                ))}
                {editable && (
                  <Button variant="ghost" size="sm" onClick={() => addRow(date)}><Plus className="mr-1 h-4 w-4" /> Split / add entry</Button>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
