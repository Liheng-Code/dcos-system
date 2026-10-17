"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  addDeliverable,
  addTaskComment,
  completeTask,
  loadTaskDetail,
  pauseTask,
  recordProgress,
  reportBlocker,
  resolveBlocker,
  reviewTask,
  startTask,
  submitDeliverable,
  submitTaskForReview,
  type TaskDetailData,
} from "@/lib/project/tasks/staff-task-service";

export interface ActionTask {
  id: string;
  task_code: string;
  task_name: string;
  description?: string | null;
  status: string;
  progress: number | null;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  reviewer_id?: string | null;
  approver_id?: string | null;
  estimated_hours?: number | null;
  planned_hours?: number | null;
  actual_hours?: number | null;
  remaining_hours?: number | null;
  is_blocked?: boolean | null;
}

interface Props {
  task: ActionTask | null;
  userId: string;
  onClose: () => void;
  /** Called after any change so the list can reload. */
  onChanged: () => void;
}

const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400";

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TaskActionDialog(props: Props) {
  const { task } = props;
  if (!task) return null;
  return <TaskActionContent key={task.id} {...props} task={task} />;
}

function TaskActionContent({ task, userId, onClose, onChanged }: Props & { task: ActionTask }) {
  const supabase = useMemo(() => createClient(), []);
  const [detail, setDetail] = useState<TaskDetailData | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(task.progress != null ? String(Math.round(task.progress)) : "");
  const [hours, setHours] = useState("");
  const [remaining, setRemaining] = useState("");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [blockerTitle, setBlockerTitle] = useState("");
  const [blockerAction, setBlockerAction] = useState("");
  const [delivName, setDelivName] = useState("");
  const [decisionComments, setDecisionComments] = useState("");
  const [decisionCorrections, setDecisionCorrections] = useState("");

  const isOwner = task.owner_id === userId;
  const isReviewer = (task.reviewer_id === userId || task.approver_id === userId) && !isOwner;

  const taskId = task.id;
  const reload = useCallback(async () => {
    try {
      setDetail(await loadTaskDetail(supabase, taskId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load task details");
    }
  }, [supabase, taskId]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged();
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const canWork = isOwner && ["assigned", "open", "paused", "in_progress"].includes(task.status);
  const estimate = task.estimated_hours ?? task.planned_hours ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {task.task_code} · {task.task_name}
          </DialogTitle>
          <DialogDescription>
            {label(task.status)} · {task.start_date ?? "no start"} → {task.end_date ?? "no finish"} · Progress{" "}
            {Math.round(task.progress ?? 0)}%
            {estimate != null ? ` · Estimate ${estimate}h` : ""}
            {task.actual_hours ? ` · Actual ${task.actual_hours}h` : ""}
            {task.is_blocked ? " · Blocked" : ""}
          </DialogDescription>
        </DialogHeader>

        {task.description && <p className="text-sm text-slate-600">{task.description}</p>}
        {!detail && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {detail && (
          <div className="space-y-5 text-sm">
            {/* Owner actions */}
            {isOwner && (
              <section className="space-y-3 rounded-xl border border-slate-200 p-3">
                <h3 className="font-semibold">My work</h3>
                <div className="flex flex-wrap gap-2">
                  {["assigned", "open", "paused"].includes(task.status) && (
                    <Button size="sm" disabled={busy} onClick={() => run(() => startTask(supabase, task.id), "Task started")}>
                      {task.status === "paused" ? "Resume" : "Start work"}
                    </Button>
                  )}
                  {task.status === "in_progress" && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => pauseTask(supabase, task.id), "Task paused")}>
                        Pause
                      </Button>
                      <Button size="sm" disabled={busy} onClick={() => run(() => submitTaskForReview(supabase, task.id, note), "Submitted for review")}>
                        Submit for review
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => completeTask(supabase, task.id, note), "Task completed")}>
                        Complete (no review)
                      </Button>
                    </>
                  )}
                </div>
                {task.status === "in_progress" && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <Label className="text-xs">Progress %</Label>
                      <Input type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Hours worked</Label>
                      <Input type="number" min={0} max={24} step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Work date</Label>
                      <Input type="date" value={workDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setWorkDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Remaining h</Label>
                      <Input type="number" min={0} step="0.5" value={remaining} onChange={(e) => setRemaining(e.target.value)} />
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <Label className="text-xs">Note (also used when submitting)</Label>
                      <textarea className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <Button
                        size="sm"
                        disabled={busy || progress === ""}
                        onClick={() =>
                          run(
                            () =>
                              recordProgress(supabase, task.id, {
                                progress: Number(progress),
                                hours: hours ? Number(hours) : null,
                                remainingHours: remaining ? Number(remaining) : null,
                                comment: note,
                                workDate,
                              }),
                            "Progress recorded",
                          )
                        }
                      >
                        Save progress
                      </Button>
                    </div>
                  </div>
                )}
                {!canWork && <p className="text-xs text-slate-500">No actions available in status “{label(task.status)}”.</p>}
              </section>
            )}

            {/* Reviewer actions */}
            {isReviewer && task.status === "review" && (
              <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <h3 className="font-semibold">Review</h3>
                <div>
                  <Label className="text-xs">Comments</Label>
                  <textarea className={field} rows={2} value={decisionComments} onChange={(e) => setDecisionComments(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Required corrections (when returning)</Label>
                  <textarea className={field} rows={2} value={decisionCorrections} onChange={(e) => setDecisionCorrections(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => run(() => reviewTask(supabase, task.id, "approved", { comments: decisionComments }), "Approved")}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(() => reviewTask(supabase, task.id, "returned", { comments: decisionComments, corrections: decisionCorrections }), "Returned for revision")}
                  >
                    Return for revision
                  </Button>
                </div>
              </section>
            )}

            {/* Deliverables */}
            <section className="space-y-2">
              <h3 className="font-semibold">Deliverables</h3>
              {detail.deliverables.length === 0 && <p className="text-xs text-slate-500">None defined.</p>}
              {detail.deliverables.map((d) => (
                <DeliverableRow
                  key={String(d.id)}
                  d={d}
                  canEdit={isOwner}
                  busy={busy}
                  onSubmit={(url) => run(() => submitDeliverable(supabase, String(d.id), { externalUrl: url }), "Deliverable submitted")}
                />
              ))}
              {isOwner && (
                <div className="flex gap-2">
                  <Input placeholder="New deliverable name" value={delivName} onChange={(e) => setDelivName(e.target.value)} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !delivName.trim()}
                    onClick={() => run(async () => { await addDeliverable(supabase, task.id, userId, { name: delivName }); setDelivName(""); }, "Deliverable added")}
                  >
                    Add
                  </Button>
                </div>
              )}
            </section>

            {/* Blockers */}
            <section className="space-y-2">
              <h3 className="font-semibold">Blockers</h3>
              {detail.blockers.length === 0 && <p className="text-xs text-slate-500">No blockers reported.</p>}
              {detail.blockers.map((b) => (
                <div key={String(b.id)} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{String(b.title)}</span>
                    <span className="text-xs text-slate-500">{label(String(b.status))}</span>
                  </div>
                  {b.required_action ? <div className="text-xs text-slate-600">Needs: {String(b.required_action)}</div> : null}
                  {b.resolution_comment ? <div className="text-xs text-emerald-700">Resolved: {String(b.resolution_comment)}</div> : null}
                  {["open", "escalated"].includes(String(b.status)) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 h-7 text-xs"
                      disabled={busy}
                      onClick={() => {
                        const c = window.prompt("How was it resolved?");
                        if (c) void run(() => resolveBlocker(supabase, String(b.id), userId, c), "Blocker resolved");
                      }}
                    >
                      Mark resolved
                    </Button>
                  )}
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input placeholder="Report a blocker: title" value={blockerTitle} onChange={(e) => setBlockerTitle(e.target.value)} />
                <Input placeholder="Action needed / from whom" value={blockerAction} onChange={(e) => setBlockerAction(e.target.value)} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !blockerTitle.trim()}
                  onClick={() => run(async () => { await reportBlocker(supabase, task.id, userId, { title: blockerTitle, requiredAction: blockerAction }); setBlockerTitle(""); setBlockerAction(""); }, "Blocker reported")}
                >
                  Report
                </Button>
              </div>
            </section>

            {/* Reviews */}
            {detail.reviews.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold">Review history</h3>
                {detail.reviews.map((r) => (
                  <div key={String(r.id)} className="rounded-lg border border-slate-200 p-2 text-xs">
                    <div className="font-medium">
                      {label(String(r.decision))} · {String(r.decided_at).slice(0, 16).replace("T", " ")}
                    </div>
                    {r.comments ? <div>{String(r.comments)}</div> : null}
                    {r.required_corrections ? <div className="text-amber-700">Corrections: {String(r.required_corrections)}</div> : null}
                  </div>
                ))}
              </section>
            )}

            {/* Progress history */}
            {detail.progress.length > 0 && (
              <section className="space-y-1">
                <h3 className="font-semibold">Progress history</h3>
                {detail.progress.map((p) => (
                  <div key={String(p.id)} className="text-xs text-slate-600">
                    {String(p.created_at).slice(0, 10)} · {String(p.previous_progress ?? 0)}% → {String(p.new_progress)}%
                    {p.hours ? ` · ${String(p.hours)}h` : ""}
                    {p.comment ? ` · ${String(p.comment)}` : ""}
                  </div>
                ))}
              </section>
            )}

            {/* Comments */}
            <section className="space-y-2">
              <h3 className="font-semibold">Comments</h3>
              {detail.comments.map((c) => (
                <div key={String(c.id)} className="rounded-lg bg-slate-50 p-2 text-xs">
                  <span className="text-slate-400">{String(c.created_at).slice(0, 16).replace("T", " ")}</span> {String(c.body)}
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Add a comment or ask for clarification" value={comment} onChange={(e) => setComment(e.target.value)} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !comment.trim()}
                  onClick={() => run(async () => { await addTaskComment(supabase, task.id, userId, comment); setComment(""); }, "Comment added")}
                >
                  Post
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeliverableRow({
  d,
  canEdit,
  busy,
  onSubmit,
}: {
  d: Record<string, unknown>;
  canEdit: boolean;
  busy: boolean;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const status = String(d.status);
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {String(d.name)}
          {d.is_required ? <span className="ml-1 text-xs text-red-500">required</span> : null}
        </span>
        <span className="text-xs text-slate-500">{label(status)}</span>
      </div>
      {d.external_url ? (
        <a className="text-xs text-blue-600 underline" href={String(d.external_url)} target="_blank" rel="noreferrer">
          {String(d.external_url)}
        </a>
      ) : null}
      {canEdit && ["pending", "in_progress", "returned"].includes(status) && (
        <div className="mt-1 flex gap-2">
          <Input className="h-8 text-xs" placeholder="Link to the file or document" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy || !url.trim()} onClick={() => onSubmit(url)}>
            Submit
          </Button>
        </div>
      )}
    </div>
  );
}
