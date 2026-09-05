"use client";

import { useEffect, useState } from "react";
import { Camera, Layers, Loader2, Plus, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import {
  captureScheduleRevision,
  createScheduleStream,
  deriveScheduleRevision,
  listComparisonSources,
  listScheduleStreams,
  type ComparisonSourceOption,
  type ScheduleStream,
  type ShiftUnit,
} from "@/lib/planning/schedule-comparison-service";

interface Props {
  projectId: string;
  onClose: () => void;
  /** Fires after any create/capture/derive — the caller reloads its source list. */
  onChanged: () => void;
}

const TYPE_LABELS: Record<ScheduleStream["stream_type"], string> = {
  internal: "Internal",
  external: "External",
};

interface ShiftForm {
  fromKey: string;
  amount: string;
  unit: ShiftUnit;
  direction: "earlier" | "later";
  note: string;
}

const DEFAULT_SHIFT_FORM: ShiftForm = { fromKey: "", amount: "2", unit: "months", direction: "earlier", note: "" };

/** The from-schedule / amount-unit-direction / note controls, shared by "New schedule" and each stream's "Derive". */
function ShiftFields({
  value,
  onChange,
  sourceOptions,
}: {
  value: ShiftForm;
  onChange: (next: ShiftForm) => void;
  sourceOptions: ComparisonSourceOption[];
}) {
  return (
    <div className="space-y-2">
      <select
        value={value.fromKey}
        onChange={(e) => onChange({ ...value, fromKey: e.target.value })}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
      >
        <option value="">— Source schedule (e.g. Baseline) —</option>
        {sourceOptions.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1.5">
        <select
          value={value.direction}
          onChange={(e) => onChange({ ...value, direction: e.target.value as "earlier" | "later" })}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
        >
          <option value="earlier">Earlier by</option>
          <option value="later">Later by</option>
        </select>
        <input
          type="number"
          min={1}
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
        />
        <select
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value as ShiftUnit })}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
        >
          <option value="days">Days</option>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
        </select>
      </div>
      <input
        value={value.note}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
        placeholder="Note (optional)"
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] outline-none"
      />
    </div>
  );
}

export function PlanManageSchedulesDialog({ projectId, onClose, onChanged }: Props) {
  const [streams, setStreams] = useState<ScheduleStream[]>([]);
  const [sourceOptions, setSourceOptions] = useState<ComparisonSourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newType, setNewType] = useState<ScheduleStream["stream_type"]>("internal");
  const [newName, setNewName] = useState("");
  const [populateNow, setPopulateNow] = useState(true);
  const [createShift, setCreateShift] = useState<ShiftForm>(DEFAULT_SHIFT_FORM);

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [deriveOpenFor, setDeriveOpenFor] = useState<string | null>(null);
  const [deriveForm, setDeriveForm] = useState<ShiftForm>(DEFAULT_SHIFT_FORM);

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
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function openDerive(streamId: string) {
    setDeriveForm(DEFAULT_SHIFT_FORM);
    setDeriveOpenFor(streamId);
  }

  function validateShift(form: ShiftForm): ComparisonSourceOption | null {
    const opt = sourceOptions.find((o) => o.key === form.fromKey);
    if (!opt) {
      toast.error("Pick a source schedule to derive from.");
      return null;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Shift amount must be a positive number.");
      return null;
    }
    return opt;
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Give the schedule a name.");
      return;
    }
    let fromOpt: ComparisonSourceOption | null = null;
    if (populateNow) {
      fromOpt = validateShift(createShift);
      if (!fromOpt) return;
    }
    setBusy(true);
    try {
      const streamId = await createScheduleStream(projectId, newType, name);
      if (fromOpt) {
        await deriveScheduleRevision({
          projectId,
          fromSource: fromOpt.source,
          targetStreamId: streamId,
          shiftAmount: Number(createShift.amount),
          shiftUnit: createShift.unit,
          shiftDirection: createShift.direction,
          note: createShift.note.trim() || undefined,
        });
      }
      toast.success(`"${name}" created${fromOpt ? ` — Rev 1 derived from "${fromOpt.label}"` : ""}`);
      setNewName("");
      setCreateShift(DEFAULT_SHIFT_FORM);
      reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCapture(streamId: string) {
    setBusy(true);
    try {
      const rev = await captureScheduleRevision(streamId, noteDrafts[streamId]?.trim() || undefined);
      toast.success(`Revision ${rev} captured`);
      setNoteDrafts((p) => ({ ...p, [streamId]: "" }));
      reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDerive(streamId: string) {
    const opt = validateShift(deriveForm);
    if (!opt) return;
    setBusy(true);
    try {
      const rev = await deriveScheduleRevision({
        projectId,
        fromSource: opt.source,
        targetStreamId: streamId,
        shiftAmount: Number(deriveForm.amount),
        shiftUnit: deriveForm.unit,
        shiftDirection: deriveForm.direction,
        note: deriveForm.note.trim() || undefined,
      });
      toast.success(`Revision ${rev} derived from "${opt.label}"`);
      setDeriveOpenFor(null);
      reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Manage Schedules</h2>
            <p className="text-[11px] text-white/70">
              Internal &amp; external schedule streams, each with its own revision history
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 text-xs">
          {/* Create new stream */}
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="mb-2 font-semibold">New schedule</p>
            <div className="flex gap-4">
              {(Object.keys(TYPE_LABELS) as ScheduleStream["stream_type"][]).map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input type="radio" checked={newType === t} onChange={() => setNewType(t)} />
                  {TYPE_LABELS[t]}
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={newType === "internal" ? "e.g. Internal Working Schedule" : "e.g. External — Consultant Coordination"}
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
              </button>
            </div>

            <label className="mt-3 flex items-center gap-1.5 border-t border-border pt-2">
              <input type="checkbox" checked={populateNow} onChange={(e) => setPopulateNow(e.target.checked)} />
              <Wand2 className="h-3 w-3 text-muted-foreground" />
              Populate its first revision now, shifted from another schedule
            </label>
            {populateNow && (
              <div className="mt-2">
                <ShiftFields value={createShift} onChange={setCreateShift} sourceOptions={sourceOptions} />
              </div>
            )}
          </div>

          {/* Existing streams */}
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : streams.length === 0 ? (
            <p className="py-2 text-center text-muted-foreground">No Internal or External schedules yet.</p>
          ) : (
            <div className="space-y-3">
              {streams.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="mr-1.5 inline-flex items-center rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                        {TYPE_LABELS[s.stream_type]}
                      </span>
                      <span className="font-semibold">{s.name}</span>
                    </div>
                  </div>

                  {s.revisions.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {s.revisions.map((r) => (
                        <li key={r.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            Rev {r.revision_number} — {new Date(r.created_at).toLocaleDateString()}
                            {r.note ? ` · ${r.note}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-2 flex gap-2">
                    <input
                      value={noteDrafts[s.id] ?? ""}
                      onChange={(e) => setNoteDrafts((p) => ({ ...p, [s.id]: e.target.value }))}
                      placeholder="Note (optional) — e.g. Issued to consultant for review"
                      className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCapture(s.id)}
                      disabled={busy}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted/40 disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" /> Capture Revision
                    </button>
                  </div>

                  {deriveOpenFor === s.id ? (
                    <div className="mt-2 space-y-2 rounded-md border border-dashed border-border p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Derive from another schedule
                        </span>
                        <button
                          type="button"
                          onClick={() => setDeriveOpenFor(null)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <ShiftFields value={deriveForm} onChange={setDeriveForm} sourceOptions={sourceOptions} />
                      <button
                        type="button"
                        onClick={() => handleDerive(s.id)}
                        disabled={busy}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {busy && <Loader2 className="h-3 w-3 animate-spin" />} Derive Revision
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openDerive(s.id)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <Wand2 className="h-3 w-3" /> Derive from another schedule…
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

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
