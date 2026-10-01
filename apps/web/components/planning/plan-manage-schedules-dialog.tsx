"use client";

import { useEffect, useState } from "react";
import { Camera, Check, Copy, Layers, Loader2, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  captureScheduleRevision,
  createProgrammeTransmittal,
  createScheduleStream,
  deleteScheduleRevision,
  deleteScheduleStream,
  deriveScheduleRevision,
  listComparisonSources,
  listScheduleStreams,
  renameScheduleStream,
  transitionRevision,
  updateScheduleRevisionNote,
  type ComparisonSourceOption,
  type RevisionStatus,
  type ScheduleStream,
  type ScheduleStreamRevision,
  type ShiftUnit,
} from "@/lib/planning/schedule-comparison-service";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { getProfileById, getProfileByIdOfCompanyId, listStakeholderAbbreviations } from "@/lib/planning/planning-queries";

const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  draft: "Draft",
  submitted_internal: "Submitted (internal)",
  approved_internal: "Approved (internal)",
  submitted_client: "Submitted to client",
  approved_client: "Approved by client",
  rejected: "Rejected",
};
const REVISION_STATUS_CLASS: Record<RevisionStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  submitted_internal: "bg-amber-50 text-amber-700",
  approved_internal: "bg-blue-50 text-blue-700",
  submitted_client: "bg-violet-50 text-violet-700",
  approved_client: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

type StreamType = ScheduleStream["stream_type"];

interface Props {
  projectId: string;
  onClose: () => void;
  /** Fires after any create/capture/derive/rename/delete — the caller reloads its source list. */
  onChanged: () => void;
}

const TYPE_LABELS: Record<StreamType, string> = { internal: "Internal", external: "External" };
const TYPE_BLURB: Record<StreamType, string> = {
  internal:
    "Your team's private working plan — the schedule you actually drive day to day. Not shared outside.",
  external:
    "The dates you share with the client, consultant or authority — your contract-facing programme.",
};
const NEW_NAME_PLACEHOLDER: Record<StreamType, string> = {
  internal: "e.g. Internal Working Schedule",
  external: "e.g. External — Client Baseline",
};
const TABS: readonly StreamType[] = ["internal", "external"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function PlanManageSchedulesDialog({ projectId, onClose, onChanged }: Props) {
  const [streams, setStreams] = useState<ScheduleStream[]>([]);
  const [sourceOptions, setSourceOptions] = useState<ComparisonSourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<StreamType>("internal");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  function reload() {
    setLoading(true);
    Promise.all([listScheduleStreams(projectId), listComparisonSources(projectId)])
      .then(([s, o]) => {
        setStreams(s);
        setSourceOptions(o);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    reload();
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: profile } = await getProfileById(uid, "role");
      setIsAdmin((profile as { role?: string } | null)?.role === "admin");
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function afterChange() {
    reload();
    onChanged();
  }

  async function handleCreate(type: StreamType) {
    const name = newName.trim();
    if (!name) {
      toast.error("Give the schedule a name.");
      return;
    }
    setCreating(true);
    try {
      await createScheduleStream(projectId, type, name);
      toast.success(`"${name}" created — now add its first version below.`);
      setNewName("");
      afterChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Manage Schedules</h2>
            <p className="text-[11px] text-white/70">
              Saved sets of project dates for the Comparison tab — your live Gantt is never changed
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as StreamType);
            setNewName("");
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border px-4 py-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="internal">Internal schedule</TabsTrigger>
              <TabsTrigger value="external">External schedule</TabsTrigger>
            </TabsList>
          </div>

          {TABS.map((t) => {
            const list = streams.filter((s) => s.stream_type === t);
            return (
              <TabsContent
                key={t}
                value={t}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs"
              >
                <p className="rounded-md bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  {TYPE_BLURB[t]} Each schedule holds dated <b className="text-foreground">versions</b> (v1, v2,
                  …) — add one by snapshotting today&apos;s Gantt, or by copying another schedule shifted earlier
                  / later.
                </p>

                {loading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    {list.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                        No {TYPE_LABELS[t]} schedule yet — create one below.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {list.map((s) => (
                          <StreamCard
                            key={s.id}
                            stream={s}
                            sourceOptions={sourceOptions}
                            isAdmin={isAdmin}
                            onChanged={afterChange}
                          />
                        ))}
                      </div>
                    )}

                    {/* Create a(nother) schedule of this type */}
                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {list.length === 0 ? `Create the ${TYPE_LABELS[t]} schedule` : `New ${TYPE_LABELS[t]} schedule`}
                      </p>
                      <div className="flex gap-2">
                        <input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleCreate(t)}
                          placeholder={NEW_NAME_PLACEHOLDER[t]}
                          className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCreate(t)}
                          disabled={creating}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Create
                        </button>
                      </div>
                    </div>

                    {!isAdmin && (
                      <p className="text-[10px] text-muted-foreground">
                        Deleting a schedule or a version needs an admin account. You can still rename schedules
                        and edit version notes.
                      </p>
                    )}
                  </>
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StreamCard({
  stream,
  sourceOptions,
  isAdmin,
  onChanged,
}: {
  stream: ScheduleStream;
  sourceOptions: ComparisonSourceOption[];
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(stream.name);
  const [confirmDeleteStream, setConfirmDeleteStream] = useState(false);

  // "Add a version" sub-form
  const [mode, setMode] = useState<"snapshot" | "copy">("snapshot");
  const [note, setNote] = useState("");
  const [fromKey, setFromKey] = useState("");
  const [amount, setAmount] = useState("2");
  const [unit, setUnit] = useState<ShiftUnit>("months");
  const [direction, setDirection] = useState<"earlier" | "later">("earlier");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function saveRename() {
    const name = nameDraft.trim();
    if (!name || name === stream.name) {
      setRenaming(false);
      setNameDraft(stream.name);
      return;
    }
    void run(async () => {
      await renameScheduleStream(stream.id, name);
      toast.success("Renamed");
      setRenaming(false);
    });
  }

  function doSnapshot() {
    void run(async () => {
      const rev = await captureScheduleRevision(stream.id, note.trim() || undefined);
      toast.success(`Version ${rev} saved from the current Gantt`);
      setNote("");
    });
  }

  function doCopy() {
    const opt = sourceOptions.find((o) => o.key === fromKey);
    if (!opt) {
      toast.error("Pick a schedule to copy dates from.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Shift amount must be a positive number.");
      return;
    }
    void run(async () => {
      const rev = await deriveScheduleRevision({
        projectId: stream.project_id,
        fromSource: opt.source,
        targetStreamId: stream.id,
        shiftAmount: amt,
        shiftUnit: unit,
        shiftDirection: direction,
        note: note.trim() || undefined,
      });
      toast.success(`Version ${rev} created from "${opt.label}" — shifted ${amt} ${unit} ${direction}`);
      setNote("");
    });
  }

  return (
    <div className="rounded-lg border border-border">
      {/* Header row: name · rename · delete */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        {renaming ? (
          <>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") {
                  setRenaming(false);
                  setNameDraft(stream.name);
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none"
            />
            <button onClick={saveRename} disabled={busy} title="Save" className="rounded p-1 text-primary hover:bg-muted">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setRenaming(false);
                setNameDraft(stream.name);
              }}
              title="Cancel"
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{stream.name}</span>
            <button
              onClick={() => {
                setNameDraft(stream.name);
                setRenaming(true);
              }}
              title="Rename schedule"
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {isAdmin &&
              (confirmDeleteStream ? (
                <span className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Delete whole schedule?</span>
                  <button
                    onClick={() =>
                      run(async () => {
                        await deleteScheduleStream(stream.id);
                        toast.success("Schedule deleted");
                      })
                    }
                    disabled={busy}
                    className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDeleteStream(false)}
                    className="rounded border border-border px-1.5 py-0.5 text-[10px]"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteStream(true)}
                  title="Delete schedule"
                  className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ))}
          </>
        )}
      </div>

      <div className="p-3">
        {/* Versions */}
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Versions</p>
        {stream.revisions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No versions yet — add the first one below.</p>
        ) : (
          <ul className="space-y-1">
            {stream.revisions.map((r) => (
              <RevisionRow key={r.id} rev={r} isAdmin={isAdmin} busy={busy} run={run} />
            ))}
          </ul>
        )}

        {/* Add a version */}
        <div className="mt-3 rounded-md border border-dashed border-border p-2.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add a version</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <label
              className={cn(
                "flex cursor-pointer gap-2 rounded-md border p-2 text-[11px]",
                mode === "snapshot" ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <input type="radio" checked={mode === "snapshot"} onChange={() => setMode("snapshot")} className="mt-0.5" />
              <span>
                <span className="block font-semibold text-foreground">Snapshot the current Gantt</span>
                <span className="text-muted-foreground">Saves today&apos;s live dates as a new version.</span>
              </span>
            </label>
            <label
              className={cn(
                "flex cursor-pointer gap-2 rounded-md border p-2 text-[11px]",
                mode === "copy" ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <input type="radio" checked={mode === "copy"} onChange={() => setMode("copy")} className="mt-0.5" />
              <span>
                <span className="block font-semibold text-foreground">Copy another schedule, shifted</span>
                <span className="text-muted-foreground">Move all of its dates earlier or later.</span>
              </span>
            </label>
          </div>

          {mode === "copy" && (
            <div className="mt-2 space-y-2">
              <select
                value={fromKey}
                onChange={(e) => setFromKey(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
              >
                <option value="">— Copy dates from —</option>
                {sourceOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1.5">
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "earlier" | "later")}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
                >
                  <option value="earlier">Earlier by</option>
                  <option value="later">Later by</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as ShiftUnit)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                </select>
              </div>
            </div>
          )}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) — e.g. Issued to consultant for review"
            className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
          />

          <button
            type="button"
            onClick={mode === "snapshot" ? doSnapshot : doCopy}
            disabled={busy}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : mode === "snapshot" ? (
              <Camera className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {mode === "snapshot" ? "Save snapshot as new version" : "Create copy as new version"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RevisionRow({
  rev,
  isAdmin,
  busy,
  run,
}: {
  rev: ScheduleStreamRevision;
  isAdmin: boolean;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rev.note ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const perms = usePlanningPermissions();

  const [transmitOpen, setTransmitOpen] = useState(false);
  const [receivers, setReceivers] = useState<{ stakeholder_id: string; abbreviation: string; organization_name: string }[]>([]);
  const [receiverId, setReceiverId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [transmitBusy, setTransmitBusy] = useState(false);

  async function openTransmit() {
    setTransmitOpen(true);
    if (receivers.length > 0) return;
    const supabase = createClient();
    const [{ data: recData }, { data: { user } }] = await Promise.all([
      listStakeholderAbbreviations(),
      supabase.auth.getUser(),
    ]);
    setReceivers(
      ((recData ?? []) as unknown as { stakeholder_id: string; abbreviation: string; stakeholders: { organization_name: string } }[]).map((r) => ({
        stakeholder_id: r.stakeholder_id,
        abbreviation: r.abbreviation,
        organization_name: r.stakeholders?.organization_name ?? "",
      })),
    );
    if (user) {
      const { data: profile } = await getProfileByIdOfCompanyId(user.id);
      if (profile?.company_id) setCompanyId(profile.company_id as string);
    }
  }

  async function doTransmit() {
    if (!companyId || !receiverId) { toast.error("Select the receiving stakeholder"); return; }
    setTransmitBusy(true);
    await run(async () => {
      const result = await createProgrammeTransmittal(rev.id, companyId, receiverId);
      toast.success(`Transmittal ${result.transmittal_code} issued`);
      setTransmitOpen(false);
    });
    setTransmitBusy(false);
  }

  async function transition(action: Parameters<typeof transitionRevision>[1]) {
    const comment = action === "reject" || action === "client_reject" ? window.prompt("Reason (required):") : undefined;
    if ((action === "reject" || action === "client_reject") && !comment?.trim()) return;
    if (action === "client_approve" && !window.confirm("Record the client's approval of this revision? This will create a new baseline.")) return;
    await run(async () => {
      const result = await transitionRevision(rev.id, action, comment ?? undefined);
      toast.success(`Revision ${rev.revision_number}: ${REVISION_STATUS_LABEL[result.status]}`);
    });
  }

  return (
    <li className="rounded-md bg-muted/30 px-2 py-1 text-[11px]">
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 font-semibold">v{rev.revision_number}</span>
      <span className="shrink-0 text-muted-foreground">{fmtDate(rev.created_at)}</span>
      {editing ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(rev.note ?? "");
              }
            }}
            placeholder="Note"
            className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] outline-none"
          />
          <button
            onClick={() =>
              run(async () => {
                await updateScheduleRevisionNote(rev.id, draft);
                toast.success("Note updated");
                setEditing(false);
              })
            }
            disabled={busy}
            title="Save note"
            className="rounded p-0.5 text-primary hover:bg-muted"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setDraft(rev.note ?? "");
            }}
            title="Cancel"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{rev.note ? `· ${rev.note}` : ""}</span>
          <button
            onClick={() => {
              setDraft(rev.note ?? "");
              setEditing(true);
            }}
            title="Edit note"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {isAdmin &&
            (confirmDelete ? (
              <span className="flex items-center gap-1">
                <button
                  onClick={() =>
                    run(async () => {
                      await deleteScheduleRevision(rev.id);
                      toast.success(`Version ${rev.revision_number} deleted`);
                    })
                  }
                  disabled={busy}
                  className="rounded bg-red-600 px-1 py-0.5 text-[9px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded border border-border px-1 py-0.5 text-[9px]"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete version"
                className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ))}
        </>
      )}
    </div>

    <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-1">
      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", REVISION_STATUS_CLASS[rev.status])}>
        {REVISION_STATUS_LABEL[rev.status]}
      </span>
      {rev.decision_comment && (
        <span className="truncate text-[10px] italic text-muted-foreground" title={rev.decision_comment}>
          &ldquo;{rev.decision_comment}&rdquo;
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {rev.status === "draft" && perms.canSubmitProgramme && (
          <button
            onClick={() => void transition("submit")}
            disabled={busy}
            className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Submit for review
          </button>
        )}
        {rev.status === "submitted_internal" && perms.canApproveProgramme && (
          <>
            <button
              onClick={() => void transition("approve")}
              disabled={busy}
              className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => void transition("reject")}
              disabled={busy}
              className="rounded border border-red-200 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {rev.status === "approved_internal" && perms.canSubmitProgramme && (
          <button
            onClick={() => void transition("submit_client")}
            disabled={busy}
            className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Submit to client
          </button>
        )}
        {rev.status === "submitted_client" && perms.canApproveProgramme && (
          <>
            <button
              onClick={() => void transition("client_approve")}
              disabled={busy}
              title="Records the client's decision on their behalf and creates a new baseline"
              className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Record client approval
            </button>
            <button
              onClick={() => void transition("client_reject")}
              disabled={busy}
              className="rounded border border-red-200 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Record client rejection
            </button>
          </>
        )}
        {rev.status === "approved_client" && perms.canApproveProgramme && (
          rev.transmittal_id ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">Transmitted</span>
          ) : (
            <button
              onClick={() => void openTransmit()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Send className="h-2.5 w-2.5" />
              Transmit
            </button>
          )
        )}
      </div>
    </div>

    {transmitOpen && (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-1.5">
        <span className="text-[10px] text-muted-foreground">File to Document Control and transmit to:</span>
        <select
          className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
        >
          <option value="">Select receiver…</option>
          {receivers.map((r) => (
            <option key={r.stakeholder_id} value={r.stakeholder_id}>{r.abbreviation} — {r.organization_name}</option>
          ))}
        </select>
        <button
          onClick={() => void doTransmit()}
          disabled={transmitBusy || !receiverId}
          className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {transmitBusy ? "Transmitting..." : "Send"}
        </button>
        <button onClick={() => setTransmitOpen(false)} className="rounded border border-border px-1.5 py-0.5 text-[9px]">Cancel</button>
      </div>
    )}
    </li>
  );
}
