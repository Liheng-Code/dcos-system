"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getPlanScheduleSettingByProjectId, upsertPlanScheduleSetting } from "@/lib/planning/planning-queries";
import { useProject } from "@/components/dashboard/project-context";
import { createClient } from "@/lib/supabase/client";

/**
 * Completion Plan 2.2 — per-project toggle for the progress review flow.
 * Standalone (doesn't use the heavy useSheetData hook) to match the other
 * settings widgets on this tab (PlanCalendarList, PlanCalendarExceptions).
 */
export function PlanProgressReviewSettings() {
  const { selectedProjectId } = useProject();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  // false = following the project-type default (stored as null)
  const [explicit, setExplicit] = useState(false);
  const [lockOnComplete, setLockOnComplete] = useState(true);
  const [saving, setSaving] = useState(false);

  const projectDefault = async (projectId: string) =>
    Boolean((await createClient().rpc("progress_review_required", { p_project_id: projectId })).data);

  useEffect(() => {
    if (!selectedProjectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no project selected, nothing to load
      setLoading(false);
      return;
    }
    setLoading(true);
    getPlanScheduleSettingByProjectId(selectedProjectId, "progress_review_enabled, lock_on_complete")
      .then(async ({ data }) => {
        // Not set = the project-type default (doc 35 R4): on for awarded projects, off for tenders.
        const stored = data?.progress_review_enabled as boolean | null | undefined;
        setExplicit(stored != null);
        setEnabled(stored ?? (await projectDefault(selectedProjectId)));
        setLockOnComplete(data?.lock_on_complete ?? true);
        setLoading(false);
      });
  }, [selectedProjectId]);

  /** enabled null = back to the project-type default. */
  async function save(next: { enabled: boolean | null; lockOnComplete: boolean }) {
    if (!selectedProjectId) return;
    setSaving(true);
    const { error } = await upsertPlanScheduleSetting({
        project_id: selectedProjectId,
        progress_review_enabled: next.enabled,
        lock_on_complete: next.lockOnComplete,
        updated_at: new Date().toISOString(),
      });
    if (error) toast.error(error.message);
    else if (next.enabled === null) setEnabled(await projectDefault(selectedProjectId));
    setExplicit(next.enabled !== null);
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
              When on, progress from site staff and daily reports (including step progress and actual dates) creates a pending request instead of changing the schedule — a planner must confirm or reject it under Look-ahead ▸ Progress Reviews. Planners&apos; own edits apply directly. On by default for awarded projects, off for tenders.{" "}
              {explicit ? (
                <button type="button" className="font-medium underline" onClick={() => void save({ enabled: null, lockOnComplete })}>
                  Use the project default
                </button>
              ) : (
                <span className="font-medium">(using the project default)</span>
              )}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={lockOnComplete}
            onChange={(e) => { setLockOnComplete(e.target.checked); void save({ enabled: explicit ? enabled : null, lockOnComplete: e.target.checked }); }}
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
