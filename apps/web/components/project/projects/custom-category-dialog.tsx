"use client";

import { useState } from "react";
import { X, Layers, Building2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CustomCategoryRecord,
  saveCustomCategory,
} from "@/lib/project-categories";

interface CustomCategoryDialogProps {
  open: boolean;
  onClose: () => void;
  categoryType: "sector" | "building_type";
  sectorSlug?: string;
  sectorLabel?: string;
  onCreated: (record: CustomCategoryRecord) => void;
}

export function CustomCategoryDialog({
  open,
  onClose,
  categoryType,
  sectorSlug,
  sectorLabel,
  onCreated,
}: CustomCategoryDialogProps) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const isSector = categoryType === "sector";
  const title = isSector ? "Add New Sector" : "Add New Building Type";
  const description = isSector
    ? "Create a custom industry sector for your projects."
    : `Create a custom building type under the "${sectorLabel || sectorSlug}" sector.`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Please enter a name");
      return;
    }

    setSaving(true);
    try {
      const record = await saveCustomCategory({
        category_type: categoryType,
        label: trimmed,
        sector_slug: isSector ? null : sectorSlug,
      });

      if (record) {
        toast.success(
          `${isSector ? "Sector" : "Building Type"} "${record.label}" created successfully!`
        );
        onCreated(record);
        setLabel("");
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create category";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            {isSector ? (
              <Layers className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isSector && (
            <div className="rounded-lg bg-muted/50 p-3 text-xs border border-border/50">
              <span className="text-muted-foreground">Parent Sector: </span>
              <span className="font-semibold text-foreground">
                {sectorLabel || sectorSlug}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {isSector ? "Sector Name" : "Building Type Name"} *
            </label>
            <input
              type="text"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                isSector
                  ? "e.g. Hospitality, Agriculture, Renewable Energy"
                  : "e.g. Data Center, Resort, Sports Complex"
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !label.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
