"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  type Ncr,
  createNcr,
  generateNcrNumber,
} from "@/lib/construction/qaqc-service";

interface Props {
  projectId: string;
  irId: string | null;
  onClose: () => void;
  onCreate: (ncr: Ncr) => void;
}

export function NcrCreateSheet({ projectId, irId, onClose, onCreate }: Props) {
  const [form, setForm] = useState({
    description: "",
    severity: "minor" as Ncr["severity"],
    responsible_party: "",
    due_date: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.description.trim()) { toast.error("Description is required."); return; }
    setSaving(true);
    try {
      const ncr = await createNcr({
        project_id: projectId,
        inspection_request_id: irId,
        ncr_number: generateNcrNumber(),
        description: form.description.trim(),
        severity: form.severity,
        responsible_party: form.responsible_party || null,
        due_date: form.due_date || null,
      });
      toast.success(`NCR ${ncr.ncr_number} created`);
      onCreate(ncr);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Raise Non-Conformance Report</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {irId && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Linked to inspection request. NCR will be auto-associated with the failed IR.
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Non-Conformance Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={4}
              placeholder="Describe the non-conformance in detail…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Severity</label>
            <div className="flex gap-2">
              {(["minor", "major", "critical"] as Ncr["severity"][]).map((s) => (
                <button
                  key={s}
                  onClick={() => setForm((p) => ({ ...p, severity: s }))}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${
                    form.severity === s
                      ? s === "critical" ? "border-red-500 bg-red-500 text-white"
                        : s === "major"    ? "border-amber-500 bg-amber-500 text-white"
                        : "border-slate-400 bg-slate-400 text-white"
                      : "border-slate-200 text-slate-500 hover:border-slate-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Responsible Party</label>
            <input
              value={form.responsible_party}
              onChange={(e) => setForm((p) => ({ ...p, responsible_party: e.target.value }))}
              placeholder="Subcontractor or party responsible"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Due Date for Resolution</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 flex gap-2">
          <Button onClick={handleSave} disabled={saving || !form.description.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create NCR
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
