"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Flag, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { runScheduleCheck } from "@/lib/planning/schedule-qaqc-service";
import {
  approveBaseline,
  clearBaseline,
  listBaselines,
  rejectBaseline,
  setBaseline,
  type BaselineRow,
  type BaselineType,
} from "@/lib/planning/baseline-service";

interface Props {
  projectId: string;
  /** Task ids of the selected summary row's subtree (empty = no selection). */
  selectedTaskIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

const SLOTS = Array.from({ length: 11 }, (_, i) => i); // 0..10

export function PlanSetBaselineDialog({ projectId, selectedTaskIds, onClose, onSaved }: Props) {
  const [existing, setExisting] = useState<BaselineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"set" | "clear">("set");
  const [slot, setSlot] = useState(0);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [busy, setBusy] = useState(false);
  const [baselineName, setBaselineName] = useState("");
  const [baselineType, setBaselineType] = useState<BaselineType>("current");
  const [reason, setReason] = useState("");

  const [me, setMe] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const hasSelection = selectedTaskIds.length > 0;

  const reload = () =>
    listBaselines(projectId)
      .then((rows) => {
        setExisting(rows);
        return rows;
      })
      .catch((e) => {
        toast.error(String(e));
        return [] as BaselineRow[];
      });

  useEffect(() => {
    // Start on an empty number, so nobody's pending baseline is replaced by accident; failing that,
    // the first one that was never approved.
    reload()
      .then((rows) => {
        const used = new Map(rows.map((b) => [b.baseline_number, b]));
        const free = SLOTS.find((n) => !used.has(n)) ?? SLOTS.find((n) => used.get(n)?.status !== "approved");
        if (free !== undefined) setSlot(free);
      })
      .finally(() => setLoading(false));
    createClient().auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const byNumber = useMemo(
    () => new Map(existing.map((b) => [b.baseline_number, b])),
    [existing],
  );
  const selected = byNumber.get(slot) ?? null;
  // Approved baselines never change; a pending or rejected one in this number is replaced.
  const isLocked = selected?.status === "approved";
  const pending = existing.filter((b) => b.status === "pending");

  async function decide(b: BaselineRow, approve: boolean) {
    setBusy(true);
    try {
      if (approve) await approveBaseline(b.id);
      else await rejectBaseline(b.id, rejectReason.trim());
      toast.success(approve ? `${b.baseline_name} approved and now active` : `${b.baseline_name} rejected`);
      setRejecting(null);
      setRejectReason("");
      await reload();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Prefill governance fields from the selected slot's existing values, if any.
  /* eslint-disable react-hooks/set-state-in-effect -- syncing local form fields to the newly-selected slot's saved values */
  useEffect(() => {
    setBaselineName(selected?.baseline_name ?? "");
    setBaselineType(selected?.baseline_type ?? "current");
    setReason(selected?.reason ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, existing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function run() {
    if (isLocked && (mode === "set" || scope === "selected")) {
      toast.error("This baseline is approved and can't be changed — choose an empty number");
      return;
    }
    if (mode === "set" && baselineType === "revised" && reason.trim().length < 10) {
      toast.error("A reason of at least 10 characters is required for a revised baseline");
      return;
    }
    setBusy(true);
    try {
      const ids = scope === "selected" && hasSelection ? selectedTaskIds : null;
      if (mode === "set") {
        // A fresh schedule check goes with every submission (doc 35 Q3). With the project gate set to
        // block, the database refuses the baseline while critical findings are open.
        const check = await runScheduleCheck(projectId).catch(() => null);
        const critical = check?.results.filter((r) => !r.pass && r.severity === "critical") ?? [];
        if (critical.length) toast.warning(`Schedule check: ${critical.map((r) => r.name).join(", ")} failed`);
        await setBaseline(projectId, slot, ids, {
          name: baselineName.trim() || null,
          type: baselineType,
          reason: baselineType === "revised" ? reason.trim() : null,
        });
        toast.success("Baseline submitted. It takes effect when another planner approves it.");
      } else {
        await clearBaseline(projectId, slot, ids);
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Flag className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Set Baseline</h2>
            <p className="text-[11px] text-white/70">Snapshot the schedule; it takes effect once another planner approves it</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-xs">
          {pending.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="font-semibold">Waiting for approval</div>
              {pending.map((b) => {
                const own = !!me && b.set_by === me;
                return (
                  <div key={b.id} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">
                        {b.baseline_name} · {b.baseline_type} · {b.task_count} tasks · {b.baseline_date}
                      </span>
                      <button
                        type="button"
                        disabled={busy || own}
                        title={own ? "The person who set a baseline can't approve it" : undefined}
                        onClick={() => decide(b, true)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy || own}
                        onClick={() => setRejecting(rejecting === b.id ? null : b.id)}
                        className="rounded-md border border-current px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                    {rejecting === b.id && (
                      <div className="flex gap-2">
                        <input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason for rejecting"
                          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-foreground outline-none"
                        />
                        <button
                          type="button"
                          disabled={busy || rejectReason.trim().length < 5}
                          onClick={() => decide(b, false)}
                          className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {pending.some((b) => b.set_by === me) && (
                <p className="text-[11px]">You set one of these, so another planner must approve it.</p>
              )}
            </div>
          )}

          <div className="flex gap-4">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "set"} onChange={() => setMode("set")} /> Set baseline
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "clear"} onChange={() => setMode("clear")} /> Clear baseline
            </label>
          </div>

          <label className="block">
            <span className="font-semibold">Baseline</span>
            <select
              value={slot}
              onChange={(e) => setSlot(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
            >
              {SLOTS.map((n) => {
                const b = byNumber.get(n);
                return (
                  <option key={n} value={n}>
                    {n === 0 ? "Baseline" : `Baseline ${n}`}
                    {b
                      ? ` — ${b.baseline_type} — ${b.status === "approved" ? "approved" : b.status === "pending" ? "waiting for approval" : "rejected"} ${b.baseline_date} (${b.task_count} tasks)${b.status === "approved" ? " 🔒" : ""}`
                      : " — empty"}
                  </option>
                );
              })}
            </select>
          </label>

          {isLocked && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              {mode === "set"
                ? "This baseline is approved and can't be changed — pick an empty number to set a new one."
                : "An approved baseline can only be deleted as a whole, and only by an administrator."}
            </div>
          )}
          {mode === "set" && selected?.status === "pending" && (
            <p className="text-[11px] text-amber-700">
              Submitting here replaces the baseline waiting for approval in this number{selected.set_by !== me ? ", which someone else set" : ""}.
            </p>
          )}
          {selected?.status === "rejected" && selected.decision_comment && (
            <p className="text-[11px] text-muted-foreground">Rejected: {selected.decision_comment}</p>
          )}

          {mode === "set" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <label className="block">
                <span className="font-semibold">Name</span>
                <input
                  type="text"
                  value={baselineName}
                  onChange={(e) => setBaselineName(e.target.value)}
                  disabled={isLocked}
                  placeholder={slot === 0 ? "Baseline" : `Baseline ${slot}`}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="font-semibold">Type</span>
                <select
                  value={baselineType}
                  onChange={(e) => setBaselineType(e.target.value as BaselineType)}
                  disabled={isLocked}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none disabled:opacity-50"
                >
                  <option value="current">Current — a routine working snapshot</option>
                  <option value="revised">Revised — a formal re-baseline (requires a reason)</option>
                  <option value="contract">Contract — the agreed baseline (locks this slot permanently)</option>
                </select>
              </label>
              {baselineType === "revised" && (
                <label className="block">
                  <span className="font-semibold">Reason for revision</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={isLocked}
                    rows={2}
                    placeholder="Why is the schedule being re-baselined? (min. 10 characters)"
                    className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none disabled:opacity-50"
                  />
                </label>
              )}
              {baselineType === "contract" && (
                <p className={cn("text-[11px]", isLocked ? "text-muted-foreground" : "text-amber-700")}>
                  Setting this as the contract baseline locks the slot — it can never be overwritten or deleted afterwards.
                </p>
              )}
            </div>
          )}

          <div>
            <div className="mb-1 font-semibold">Scope</div>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Entire project
            </label>
            <label className="mt-1 flex items-center gap-1.5">
              <input
                type="radio"
                checked={scope === "selected"}
                disabled={!hasSelection}
                onChange={() => setScope("selected")}
              />
              Selected tasks{hasSelection ? ` (${selectedTaskIds.length})` : " — select a row first"}
            </label>
          </div>

          <label className="flex items-center gap-1.5 opacity-60">
            <input type="checkbox" checked disabled /> Roll up to summary tasks (automatic)
          </label>

          {loading && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy || (isLocked && (mode === "set" || scope === "selected"))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "set" ? "Submit for approval" : "Clear"}
          </button>
        </div>
      </div>
    </div>
  );
}
