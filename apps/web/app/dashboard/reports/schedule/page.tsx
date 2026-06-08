"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Clock, RefreshCw, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Schedule {
  id: string;
  name: string;
  description: string | null;
  report_type: string;
  frequency: string;
  day_of_week: number | null;
  day_of_month: number | null;
  format: string;
  recipients: string[];
  enabled: boolean;
  created_at: string;
}

const REPORT_TYPES = [
  "executive_summary", "project_status", "financial_summary",
  "schedule_summary", "procurement_status", "hse_summary",
  "site_progress", "document_status",
];

const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly"];

export default function SchedulePage() {
  const supabase = useMemo(() => createClient(), []);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", description: "", report_type: "executive_summary",
    frequency: "weekly", day_of_week: 1, day_of_month: 1,
    format: "html", recipients: "", enabled: true,
  });

  function fetchSchedules() {
    supabase.from("report_schedules")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSchedules(data as Schedule[]);
        setLoading(false);
      });
  }

  useEffect(() => { fetchSchedules(); }, [supabase]);

  async function handleCreate() {
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const recipients = form.recipients.split(",").map((s: string) => s.trim()).filter(Boolean);

    const { error } = await supabase.from("report_schedules").insert({
      name: form.name,
      description: form.description || null,
      report_type: form.report_type,
      frequency: form.frequency,
      day_of_week: form.frequency === "weekly" ? form.day_of_week : null,
      day_of_month: form.frequency === "monthly" || form.frequency === "quarterly" ? form.day_of_month : null,
      format: form.format,
      recipients,
      enabled: form.enabled,
      created_by: user.user?.id,
    });

    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Schedule created");
    setShowForm(false);
    setForm({ name: "", description: "", report_type: "executive_summary", frequency: "weekly", day_of_week: 1, day_of_month: 1, format: "html", recipients: "", enabled: true });
    fetchSchedules();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("report_schedules").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Schedule deleted");
    fetchSchedules();
  }

  async function handleToggle(id: string, enabled: boolean) {
    const { error } = await supabase.from("report_schedules").update({ enabled: !enabled }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    fetchSchedules();
  }

  async function handleRunNow(schedule: Schedule) {
    const { error } = await supabase.from("report_logs").insert({
      schedule_id: schedule.id,
      report_type: schedule.report_type,
      status: "pending",
      delivered_to: schedule.recipients,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Report queued for generation");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Report Scheduling</h1>
          <p className="text-sm text-muted-foreground">Configure recurring report generation</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Schedule
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Report Type</label>
                <select value={form.report_type} onChange={(e) => setForm({ ...form, report_type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                  {REPORT_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Frequency</label>
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                  ))}
                </select>
              </div>
              {form.frequency === "weekly" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Day of Week</label>
                  <select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: parseInt(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              {(form.frequency === "monthly" || form.frequency === "quarterly") && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Day of Month</label>
                  <input type="number" min={1} max={31} value={form.day_of_month}
                    onChange={(e) => setForm({ ...form, day_of_month: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium">Format</label>
                <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                  <option value="html">HTML</option>
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Recipients (comma-separated emails)</label>
                <input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })}
                  placeholder="user@example.com, manager@example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Create Schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No report schedules configured
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", s.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Clock className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      s.enabled ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-500",
                    )}>
                      {s.enabled ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.report_type.replace(/_/g, " ")} · {s.frequency}
                    {s.day_of_week !== null && ` · ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][s.day_of_week]}`}
                    {s.day_of_month !== null && ` · Day ${s.day_of_month}`}
                    {s.recipients?.length > 0 && ` · ${s.recipients.length} recipient(s)`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleRunNow(s)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Run now"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(s.id, s.enabled)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title={s.enabled ? "Pause" : "Activate"}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
