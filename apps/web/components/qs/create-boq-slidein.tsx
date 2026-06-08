"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createBoq, type BoqType } from "@/lib/qs-service";

const BOQ_TYPES: { value: BoqType; label: string }[] = [
  { value: "main_works", label: "Main Works" },
  { value: "preliminary", label: "Preliminary" },
  { value: "variation", label: "Variation" },
  { value: "provisional_sum", label: "Provisional Sum" },
  { value: "supplement", label: "Supplement" },
];

const CURRENCIES = ["USD", "KHR", "THB", "VND", "SGD", "MYR", "EUR", "GBP"];

interface Props {
  projectId: string;
  onClose: () => void;
  onCreated: (boqId: string) => void;
}

export function CreateBoqSlideIn({ projectId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [boqType, setBoqType] = useState<BoqType>("main_works");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const boq = await createBoq({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        boq_type: boqType,
        currency_code: currency,
      });
      toast.success("BOQ created");
      onCreated(boq.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create BOQ");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">New Bill of Quantities</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 space-y-5 p-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              BOQ Number
            </label>
            <p className="text-sm text-slate-400">Auto-generated (e.g. BOQ-002)</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Main Works - Building A"
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
              placeholder="Optional description of this BOQ..."
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !title.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create BOQ
          </Button>
        </div>
      </aside>
    </div>
  );
}
