"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getProjectSiteArea, updateProjectSiteArea } from "@/lib/wbs-area-service";

interface ProjectSiteAreaDialogProps {
  projectId: string;
  onClose: () => void;
}

// Site Area, entered once per project (DCOS-QS-GDL-001 §4) — independent of the
// per-level GFA rollup, and never used as a denominator for building cost.
export function ProjectSiteAreaDialog({ projectId, onClose }: ProjectSiteAreaDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteArea, setSiteArea] = useState("");
  const [siteAreaSource, setSiteAreaSource] = useState("");

  useEffect(() => {
    let cancelled = false;
    getProjectSiteArea(projectId).then((result) => {
      if (cancelled) return;
      setSiteArea(result.siteArea != null ? String(result.siteArea) : "");
      setSiteAreaSource(result.siteAreaSource ?? "");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  async function handleSave() {
    const numericValue = parseFloat(siteArea);
    if (Number.isNaN(numericValue) || numericValue < 0) {
      toast.error("Enter a valid Site Area (m²)");
      return;
    }
    if (!siteAreaSource.trim()) {
      toast.error("Source (title deed / survey ref) is required");
      return;
    }
    setSaving(true);
    try {
      await updateProjectSiteArea({
        projectId,
        siteArea: numericValue,
        siteAreaSource: siteAreaSource.trim(),
      });
      toast.success("Site Area saved");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Site Area");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Site Area</h2>
            <p className="text-xs text-muted-foreground">Per DCOS-QS-GDL-001 §4 — denominator for external works $/m² only.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="site_area">Site Area (m²) *</Label>
                <input
                  id="site_area"
                  type="number"
                  min="0"
                  step="0.01"
                  value={siteArea}
                  onChange={(e) => setSiteArea(e.target.value)}
                  placeholder="e.g. 4500"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="site_area_source">Source *</Label>
                <input
                  id="site_area_source"
                  value={siteAreaSource}
                  onChange={(e) => setSiteAreaSource(e.target.value)}
                  placeholder="e.g. Title deed ref TD-2026-118"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Save className="mr-1.5 h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
