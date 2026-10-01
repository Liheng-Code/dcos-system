"use client";

import { useState } from "react";
import { Loader2, Plus, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  EXTERNAL_STANDARDS,
  createBudgetCodeExternalRef,
  deleteBudgetCodeExternalRef,
  formatExternalRef,
  updateBudgetCodeExternalRef,
  type BudgetCodeExternalRef,
  type ExternalStandard,
} from "@/lib/qs/tender-cost-service";

interface Props {
  budgetCodeId: string;
  refs: BudgetCodeExternalRef[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
}

const EMPTY = { standard: "csi_masterformat" as ExternalStandard, external_code: "", external_title: "", standard_version: "", is_primary: false };

// Chips for a budget code's external classification refs (MasterFormat, NRM,
// DIN 276, ...), with a small inline editor. Clicking a chip edits it.
export function BudgetCodeExternalRefs({ budgetCodeId, refs, canCreate, canEdit, canDelete, onChanged }: Props) {
  const [editing, setEditing] = useState<BudgetCodeExternalRef | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setForm(EMPTY);
    setEditing("new");
  }

  function openEdit(ref: BudgetCodeExternalRef) {
    if (!canEdit && !canDelete) return;
    setForm({
      standard: ref.standard,
      external_code: ref.external_code,
      external_title: ref.external_title ?? "",
      standard_version: ref.standard_version ?? "",
      is_primary: ref.is_primary,
    });
    setEditing(ref);
  }

  async function save() {
    if (!form.external_code.trim()) { toast.error("External code is required"); return; }
    setSaving(true);
    try {
      if (editing === "new") await createBudgetCodeExternalRef(budgetCodeId, form);
      else if (editing) await updateBudgetCodeExternalRef(editing.id, budgetCodeId, form);
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save reference");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing || editing === "new") return;
    setSaving(true);
    try {
      await deleteBudgetCodeExternalRef(editing.id);
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete reference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {refs.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => openEdit(r)}
            title={[r.external_title, r.standard_version && `v${r.standard_version}`].filter(Boolean).join(" · ") || undefined}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              r.is_primary ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground",
              (canEdit || canDelete) && "hover:border-primary/60",
            )}
          >
            {r.is_primary && <Star className="h-2.5 w-2.5 fill-current" />}
            {formatExternalRef(r)}
          </button>
        ))}
        {canCreate && editing === null && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/60 hover:text-primary"
            title="Add an external classification reference"
          >
            <Plus className="h-2.5 w-2.5" /> Ref
          </button>
        )}
      </div>

      {editing !== null && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-1.5">
          <select
            value={form.standard}
            onChange={(e) => setForm({ ...form, standard: e.target.value as ExternalStandard })}
            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
          >
            {EXTERNAL_STANDARDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <input
            value={form.external_code}
            onChange={(e) => setForm({ ...form, external_code: e.target.value })}
            placeholder="Code, e.g. 04 20 00"
            className="w-28 rounded border border-border bg-background px-1.5 py-1 text-xs"
            autoFocus
          />
          <input
            value={form.external_title}
            onChange={(e) => setForm({ ...form, external_title: e.target.value })}
            placeholder="Title (optional)"
            className="w-36 rounded border border-border bg-background px-1.5 py-1 text-xs"
          />
          <input
            value={form.standard_version}
            onChange={(e) => setForm({ ...form, standard_version: e.target.value })}
            placeholder="Version"
            className="w-16 rounded border border-border bg-background px-1.5 py-1 text-xs"
          />
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
            Primary
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (editing === "new" ? !canCreate : !canEdit)}
            className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </button>
          {editing !== "new" && canDelete && (
            <button type="button" onClick={() => void remove()} disabled={saving} className="text-muted-foreground hover:text-red-600" title="Delete reference">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground" title="Cancel">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
