"use client";

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  updateBoq,
  type QsBoq,
  type BoqType,
  type BoqStatus,
} from "@/lib/qs-service";
import { BoqLockValidationError } from "@/lib/qs-boq-validation";

const BOQ_TYPES: { value: BoqType; label: string }[] = [
  { value: "main_works", label: "Main Works" },
  { value: "preliminary", label: "Preliminary" },
  { value: "variation", label: "Variation" },
  { value: "provisional_sum", label: "Provisional Sum" },
  { value: "supplement", label: "Supplement" },
];

const STATUSES: { value: BoqStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "locked", label: "Locked" },
  { value: "superseded", label: "Superseded" },
];

const CURRENCIES = ["USD", "KHR", "THB", "VND", "SGD", "MYR", "EUR", "GBP"];

interface Props {
  boq: QsBoq;
  onClose: () => void;
  onUpdated: (boq: QsBoq) => void;
}

export function UpdateBoqSlideIn({ boq, onClose, onUpdated }: Props) {
  const [title, setTitle] = useState(boq.title);
  const [description, setDescription] = useState(boq.description ?? "");
  const [boqType, setBoqType] = useState<BoqType>(boq.boq_type);
  const [status, setStatus] = useState<BoqStatus>(boq.status);
  const [currency, setCurrency] = useState(boq.currency_code);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const updated = await updateBoq(boq.id, {
        title: title.trim(),
        description: description.trim() || null,
        boq_type: boqType,
        currency_code: currency,
        status,
      });
      toast.success("BOQ updated");
      onUpdated(updated);
    } catch (error) {
      if (error instanceof BoqLockValidationError) {
        const firstErrors = error.issues.filter((i) => i.level === "error").slice(0, 3);
        toast.error(error.message, {
          description: [...firstErrors.map((i) => `${i.itemLabel || "BOQ"}: ${i.message}`), "Use Lock Baseline in the BOQ builder to see every finding."].join("\n"),
        });
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to update BOQ");
      }
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Edit BOQ</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 p-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              BOQ Number
            </label>
            <p className="text-sm font-medium text-slate-700">{boq.boq_number}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              BOQ Type
            </label>
            <select
              value={boqType}
              onChange={(e) => setBoqType(e.target.value as BoqType)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {BOQ_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BoqStatus)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </aside>
    </div>
  );
}
