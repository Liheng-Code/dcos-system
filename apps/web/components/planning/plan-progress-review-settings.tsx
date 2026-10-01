"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getPlanScheduleSettingByProjectId, upsertPlanScheduleSetting } from "@/lib/planning/planning-queries";
import { useProject } from "@/components/dashboard/project-context";

/**
 * Completion Plan 2.2 — per-project toggle for the progress review flow.
 * Standalone (doesn't use the heavy useSheetData hook) to match the other
 * settings widgets on this tab (PlanCalendarList, PlanCalendarExceptions).
 */
export function PlanProgressReviewSettings() {
  const { selectedProjectId } = useProject();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [lockOnComplete, setLockOnComplete] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedProjectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no project selected, nothing to load
      setLoading(false);
      return;
    }
    setLoading(true);
    getPlanScheduleSettingByProjectId(selectedProjectId, "progress_review_enabled, lock_on_complete")
      .then(({ data }) => {
        setEnabled(data?.progress_review_enabled ?? false);
        setLockOnComplete(data?.lock_on_complete ?? true);
        setLoading(false);
      });
  }, [selectedProjectId]);

  async function save(next: { enabled: boolean; lockOnComplete: boolean }) {
    if (!selectedProjectId) return;
    setSaving(true);
    const { error } = await upsertPlanScheduleSetting({
        project_id: selectedProjectId,
        progress_review_enabled: next.enabled,
        lock_on_complete: next.lockOnComplete,
        updated_at: new Date().toISOString(),
      });
    if (error) toast.error(error.message);
    setSaving(false);
  }

  if (!selectedProjectId || loading) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Progress Review</h3>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="space-y-3 text-xs">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); void save({ enabled: e.target.checked, lockOnComplete }); }}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium text-foreground">Require review before progress changes take effect</span>
            <span className="block text-muted-foreground">
              When on, editing an activity&apos;s % complete creates a pending request instead of writing it immediately — a planner must confirm or reject it under Look-ahead ▸ Progress Reviews.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={lockOnComplete}
            onChange={(e) => { setLockOnComplete(e.target.checked); void save({ enabled, lockOnComplete: e.target.checked }); }}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium text-foreground">Lock activities at 100% complete</span>
            <span className="block text-muted-foreground">
              Once an activity reaches 100%, only an admin can change its progress further without a planner unlocking it first.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
