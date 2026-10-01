"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deletePlanCalendarExceptionById, insertPlanCalendarReturning, listPlanCalendarExceptionsByCalendarIdOrderedByExceptionDate, listPlanCalendarsByProjectIdOrderedByIsDefaultAndName, updatePlanCalendarById, upsertPlanCalendarExceptionReturning } from "@/lib/planning/planning-queries";
import {
  buildWorkCalendar,
  toISO,
  workingDaysBetween,
  type PlanCalendarExceptionRow,
  type PlanCalendarRow,
} from "@/lib/planning/work-calendar";

interface Props {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}

const DAYS: { key: keyof PlanCalendarRow; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

type CalRow = PlanCalendarRow & { is_default?: boolean };
type ExcRow = PlanCalendarExceptionRow & { id: string; reason: string | null };

export function PlanWorkingTimeDialog({ projectId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [cals, setCals] = useState<CalRow[]>([]);
  const [calId, setCalId] = useState("");
  const [days, setDays] = useState<Record<string, boolean>>({});
  const [exceptions, setExceptions] = useState<ExcRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [exDate, setExDate] = useState("");
  const [exWorking, setExWorking] = useState(false);
  const [exReason, setExReason] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await listPlanCalendarsByProjectIdOrderedByIsDefaultAndName(projectId);
      const rows = (data ?? []) as CalRow[];
      setCals(rows);
      setCalId(rows[0]?.id ?? "");
      setLoading(false);
    })();
  }, [projectId]);

  useEffect(() => {
    const cal = cals.find((c) => c.id === calId);
    if (!cal) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setDays(Object.fromEntries(DAYS.map((d) => [d.key, Boolean(cal[d.key])])));
    listPlanCalendarExceptionsByCalendarIdOrderedByExceptionDate(calId)
      .then(({ data }) => setExceptions((data ?? []) as ExcRow[]));
  }, [calId, cals]);

  const preview = useMemo(() => {
    const cal = cals.find((c) => c.id === calId);
    if (!cal) return null;
    const wc = buildWorkCalendar(
      { ...cal, ...days } as unknown as PlanCalendarRow,
      exceptions,
    );
    const now = new Date();
    const first = toISO(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    const last = toISO(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
    return workingDaysBetween(wc, first, last);
  }, [cals, calId, days, exceptions]);

  async function createCalendar() {
    setBusy(true);
    const { data, error } = await insertPlanCalendarReturning({ project_id: projectId, name: "Project calendar", is_default: true });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create calendar");
      return;
    }
    setCals((p) => [...p, data as CalRow]);
    setCalId((data as CalRow).id);
  }

  async function saveWorkWeek() {
    if (!calId) return;
    setBusy(true);
    const { error } = await updatePlanCalendarById(days, calId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCals((p) => p.map((c) => (c.id === calId ? ({ ...c, ...days } as CalRow) : c)));
    onSaved();
    toast.success("Work week saved");
  }

  async function addException() {
    if (!calId || !exDate) return;
    setBusy(true);
    const { data, error } = await upsertPlanCalendarExceptionReturning({ calendar_id: calId, exception_date: exDate, is_working: exWorking, reason: exReason || null });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to add exception");
      return;
    }
    setExceptions((p) => [
      ...p.filter((e) => e.exception_date !== exDate),
      data as ExcRow,
    ].sort((a, b) => a.exception_date.localeCompare(b.exception_date)));
    setExDate("");
    setExReason("");
    onSaved();
  }

  async function delException(id: string) {
    await deletePlanCalendarExceptionById(id);
    setExceptions((p) => p.filter((e) => e.id !== id));
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Change Working Time</h2>
            <p className="text-[11px] text-white/70">
              Work week + holiday / extra-work-day exceptions for the schedule calendar
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : cals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              <p>This project has no work calendar — the schedule uses Mon–Fri.</p>
              <button
                type="button"
                onClick={createCalendar}
                disabled={busy}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3 w-3" /> Create project calendar
              </button>
            </div>
          ) : (
            <>
              <label className="block text-xs">
                <span className="font-semibold">For calendar</span>
                <select
                  value={calId}
                  onChange={(e) => setCalId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
                >
                  {cals.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="mb-1.5 text-xs font-semibold">Work week</div>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setDays((p) => ({ ...p, [d.key]: !p[d.key] }))}
                      className={
                        "rounded-md border px-2.5 py-1 text-[11px] font-medium " +
                        (days[d.key]
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground")
                      }
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {preview != null && `${preview} working days this month`}
                  </span>
                  <button
                    type="button"
                    onClick={saveWorkWeek}
                    disabled={busy}
                    className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Save work week
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold">Exceptions</div>
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/20 p-2.5 text-xs">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Date</span>
                    <input
                      type="date"
                      value={exDate}
                      onChange={(e) => setExDate(e.target.value)}
                      className="rounded border border-border bg-background px-1.5 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Type</span>
                    <select
                      value={exWorking ? "work" : "holiday"}
                      onChange={(e) => setExWorking(e.target.value === "work")}
                      className="rounded border border-border bg-background px-1.5 py-1"
                    >
                      <option value="holiday">Holiday / non-working</option>
                      <option value="work">Extra working day</option>
                    </select>
                  </label>
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">Reason</span>
                    <input
                      value={exReason}
                      onChange={(e) => setExReason(e.target.value)}
                      placeholder="e.g. National holiday"
                      className="rounded border border-border bg-background px-1.5 py-1"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addException}
                    disabled={busy || !exDate}
                    className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted/40 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-2 space-y-1">
                  {exceptions.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">No exceptions.</p>
                  )}
                  {exceptions.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-2 rounded border border-border px-2 py-1 text-xs"
                    >
                      <span className="font-mono tabular-nums">{e.exception_date}</span>
                      <span
                        className={
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                          (e.is_working
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700")
                        }
                      >
                        {e.is_working ? "Working" : "Holiday"}
                      </span>
                      <span className="truncate text-muted-foreground">{e.reason}</span>
                      <button
                        type="button"
                        onClick={() => delException(e.id)}
                        className="ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground">
                The scheduler works in whole days — hours-per-day is not modelled.
              </p>
            </>
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
