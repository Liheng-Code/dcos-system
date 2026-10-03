"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, AlertTriangle, Clock, FileText, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { getProfileById } from "@/lib/hr/hr-queries";

const OT_TYPES = [
  { value: "weekday", label: "Weekday OT" },
  { value: "weekend", label: "Weekend OT" },
  { value: "public_holiday", label: "Public Holiday OT" },
  { value: "night_shift", label: "Night Shift OT" },
  { value: "emergency", label: "Emergency OT" },
  { value: "project_critical", label: "Project Critical OT" },
];

const OT_CATEGORIES = [
  { value: "planned", label: "Planned" },
  { value: "emergency", label: "Emergency" },
  { value: "mandatory", label: "Mandatory" },
  { value: "voluntary", label: "Voluntary" },
];

const humanise = (t: string) => t.replace(/_/g, " ").replace(/w/g, (c) => c.toUpperCase());

interface OtSuggestion {
  ot_type: string;
  reason: string;
}

interface FormData {
  employee_id: string;
  project_id: string;
  wbs_node_id: string;
  task_id: string;
  department: string;
  ot_type: string;
  category: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string;
  remarks: string;
}

interface Props {
  initialData?: Partial<FormData>;
  onSuccess?: () => void;
}

export function OTRequestForm({ initialData, onSuccess }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlaps, setOverlaps] = useState<any[]>([]);
  const [checkingOverlap, setCheckingOverlap] = useState(false);
  const overlapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Once the person picks a type (or is editing a saved request), the suggestion stops overwriting it.
  const typeTouched = useRef(Boolean(initialData?.ot_type));
  const [otTypes, setOtTypes] = useState(OT_TYPES);
  const [suggestion, setSuggestion] = useState<OtSuggestion | null>(null);

  const [form, setForm] = useState<FormData>({
    employee_id: initialData?.employee_id || "",
    project_id: initialData?.project_id || "",
    wbs_node_id: initialData?.wbs_node_id || "",
    task_id: initialData?.task_id || "",
    department: initialData?.department || "",
    ot_type: initialData?.ot_type || "weekday",
    category: initialData?.category || "planned",
    start_time: initialData?.start_time || "",
    end_time: initialData?.end_time || "",
    hours: initialData?.hours || 0,
    reason: initialData?.reason || "",
    remarks: initialData?.remarks || "",
  });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        if (!initialData?.employee_id) {
          getProfileById(data.user.id, "id, full_name, department").then(({ data: profile }) => {
            if (profile) {
              setForm((f) => ({ ...f, employee_id: profile.id, department: profile.department || "" }));
            }
          });
        }
      }
    });
    // Offer exactly the OT types HR has rated; keep the built-in list if rates cannot be read.
    fetch("/api/hr/overtime/rates")
      .then((r) => r.json())
      .then((rates: { ot_type: string; is_active: boolean }[]) => {
        const active = Array.isArray(rates) ? rates.filter((r) => r.is_active) : [];
        if (active.length > 0) setOtTypes(active.map((r) => ({ value: r.ot_type, label: OT_TYPES.find((t) => t.value === r.ot_type)?.label ?? humanise(r.ot_type) })));
      })
      .catch(() => {});
  }, [initialData]);

  const autoCalcHours = (start: string, end: string) => {
    if (start && end) {
      const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
      if (diff > 0) setForm((f) => ({ ...f, hours: parseFloat(diff.toFixed(1)) }));
    }
  };

  const checkOverlap = useCallback(async (start: string, end: string) => {
    if (!start || !end || !user?.id) return;
    setCheckingOverlap(true);
    try {
      const params = new URLSearchParams({ start_time: start, end_time: end, employee_id: user.id });
      if (initialData?.start_time) params.set("exclude_id", requestIdParam());
      const res = await fetch(`/api/hr/overtime/check-overlap?${params}`);
      const data = await res.json();
      setOverlaps(data.overlaps || []);
    } catch {
      setOverlaps([]);
    } finally {
      setCheckingOverlap(false);
    }
  }, [user, initialData]);

  const suggestType = (start: string, end: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!start || !end || new Date(end) <= new Date(start)) { setSuggestion(null); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hr/overtime/suggest-type?${new URLSearchParams({ start_time: start, end_time: end })}`);
        const data = await res.json();
        const found: OtSuggestion | null = data.suggestion ?? null;
        setSuggestion(found);
        if (found && !typeTouched.current) setForm((f) => ({ ...f, ot_type: found.ot_type }));
      } catch {
        setSuggestion(null);
      }
    }, 400);
  };

  const requestIdParam = () => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/\/edit\/([^/]+)/);
    return m ? m[1] : "";
  };

  const debouncedOverlapCheck = (start: string, end: string) => {
    if (overlapTimer.current) clearTimeout(overlapTimer.current);
    overlapTimer.current = setTimeout(() => checkOverlap(start, end), 500);
  };

  const handleSubmit = async (status: "draft" | "submitted") => {
    setError(null);
    if (!form.employee_id || !form.ot_type || !form.start_time || !form.end_time || !form.reason) {
      setError("Employee, OT type, start/end time, and reason are required");
      return;
    }
    if (form.hours <= 0) {
      setError("Hours must be greater than 0");
      return;
    }

    const action = status === "submitted" ? setSubmitting : setSaving;
    action(true);

    try {
      const res = await fetch("/api/hr/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); action(false); return; }

      if (status === "submitted") {
        const submitRes = await fetch(`/api/hr/overtime/${data.id}/submit`, { method: "POST" });
        const submitData = await submitRes.json();
        if (!submitRes.ok) { setError(submitData.error); action(false); return; }
        toast.success("Request submitted for approval. Manager has been notified.");
      } else {
        toast.success("Draft saved successfully.");
      }

      action(false);
      if (onSuccess) onSuccess();
      else router.push("/dashboard/hr/overtime/my-requests");
    } catch (e: any) {
      setError(e.message);
      action(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {overlaps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Time conflict detected</p>
              <p>You already have {overlaps.length === 1 ? "an OT request" : "OT requests"} during this period:</p>
              <ul className="list-inside list-disc space-y-0.5 text-amber-700">
                {overlaps.map((o: any) => (
                  <li key={o.id}>
                    {new Date(o.start_time).toLocaleDateString()} {new Date(o.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}&ndash;
                    {new Date(o.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} &mdash; {o.ot_type.replace(/_/g, " ")} ({o.hours}h, {o.status.replace(/_/g, " ")})
                  </li>
                ))}
              </ul>
              <p className="text-amber-600">You can still submit, but please verify the schedule is correct.</p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            OT Request Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>OT Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.ot_type}
                onChange={(e) => { typeTouched.current = true; setForm((f) => ({ ...f, ot_type: e.target.value })); }}
              >
                {otTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {suggestion && (
                <p className="text-xs text-muted-foreground">
                  {suggestion.ot_type === form.ot_type
                    ? `Suggested: ${humanise(suggestion.ot_type)}, because ${suggestion.reason}.`
                    : `HR rules suggest ${humanise(suggestion.ot_type)} (${suggestion.reason}). You chose a different type.`}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {OT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, start_time: v }));
                  autoCalcHours(v, form.end_time);
                  debouncedOverlapCheck(v, form.end_time);
                  suggestType(v, form.end_time);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, end_time: v }));
                  autoCalcHours(form.start_time, v);
                  debouncedOverlapCheck(form.start_time, v);
                  suggestType(form.start_time, v);
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Total Hours</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={form.hours}
                  onChange={(e) => setForm((f) => ({ ...f, hours: parseFloat(e.target.value) || 0 }))}
                />
                <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Input
                placeholder="Project ID"
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              placeholder="Why is overtime needed?"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Remarks (optional)</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              placeholder="Additional notes..."
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button variant="secondary" onClick={() => handleSubmit("draft")} disabled={saving || submitting} className="gap-2">
          <Save className="h-4 w-4" />{saving ? "Saving..." : "Save as Draft"}
        </Button>
        <Button onClick={() => handleSubmit("submitted")} disabled={saving || submitting} className="gap-2">
          <Send className="h-4 w-4" />{submitting ? "Submitting..." : "Submit for Approval"}
        </Button>
      </div>
    </div>
  );
}
