"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";

export default function EditOTRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestData, setRequestData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/hr/overtime/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else if (data.status !== "needs_revision" && data.status !== "draft") {
          setError("This request cannot be edited in its current status");
        } else {
          setRequestData(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load request");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
        <button className="text-sm text-primary hover:underline" onClick={() => router.back()}>Go back</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit OT Request</h1>
        <p className="text-muted-foreground">Revise your overtime request and resubmit</p>
      </div>
      <OTEditForm requestId={id} initialData={requestData} onSuccess={() => router.push("/dashboard/hr/overtime/my-requests")} />
    </div>
  );
}

function OTEditForm({ requestId, initialData, onSuccess }: { requestId: string; initialData: any; onSuccess: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatForInput = (iso: string) => {
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 16);
  };

  const [form, setForm] = useState({
    ot_type: initialData?.ot_type || "weekday",
    category: initialData?.category || "planned",
    start_time: formatForInput(initialData?.start_time),
    end_time: formatForInput(initialData?.end_time),
    hours: initialData?.hours || 0,
    project_id: initialData?.project_id || "",
    reason: initialData?.reason || "",
    remarks: initialData?.remarks || "",
  });

  const autoCalcHours = (start: string, end: string) => {
    if (start && end) {
      const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
      if (diff > 0) setForm((f) => ({ ...f, hours: parseFloat(diff.toFixed(1)) }));
    }
  };

  const handleSave = async (submitAfter: boolean) => {
    setError(null);
    if (!form.ot_type || !form.start_time || !form.end_time || !form.reason) {
      setError("OT type, start/end time, and reason are required");
      return;
    }
    if (form.hours <= 0) {
      setError("Hours must be greater than 0");
      return;
    }

    const action = submitAfter ? setSubmitting : setSaving;
    action(true);

    try {
      const res = await fetch(`/api/hr/overtime/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); action(false); return; }

      if (submitAfter) {
        const submitRes = await fetch(`/api/hr/overtime/${requestId}/submit`, { method: "POST" });
        const submitData = await submitRes.json();
        if (!submitRes.ok) { setError(submitData.error); action(false); return; }
      }

      action(false);
      onSuccess();
    } catch (e: any) {
      setError(e.message);
      action(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">Revision Requested</p>
        <p className="mt-1 text-amber-700">This request was sent back for revision. Edit the details and resubmit.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">OT Type</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.ot_type}
            onChange={(e) => setForm((f) => ({ ...f, ot_type: e.target.value }))}
          >
            {OT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Category</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {OT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Start Time</label>
          <input
            type="datetime-local"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.start_time}
            onChange={(e) => {
              setForm((f) => ({ ...f, start_time: e.target.value }));
              autoCalcHours(e.target.value, form.end_time);
            }}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">End Time</label>
          <input
            type="datetime-local"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.end_time}
            onChange={(e) => {
              setForm((f) => ({ ...f, end_time: e.target.value }));
              autoCalcHours(form.start_time, e.target.value);
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Total Hours</label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.hours}
            onChange={(e) => setForm((f) => ({ ...f, hours: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Project (optional)</label>
          <input
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.project_id}
            onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Reason</label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Remarks (optional)</label>
        <textarea
          className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          value={form.remarks}
          onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        <button className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium" onClick={() => router.back()}>
          Cancel
        </button>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium gap-2"
          onClick={() => handleSave(false)}
          disabled={saving || submitting}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground gap-2"
          onClick={() => handleSave(true)}
          disabled={saving || submitting}
        >
          {submitting ? "Submitting..." : "Revise & Resubmit"}
        </button>
      </div>
    </div>
  );
}
