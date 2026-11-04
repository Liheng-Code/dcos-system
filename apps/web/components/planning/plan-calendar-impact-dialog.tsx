"use client";

// Doc 35 I2: a calendar change is previewed before it is saved. Shows what the change moves (calculated the way
// the Sheet's Calculate does), then saves it with a recalculation, or saves it and leaves the recalculation for later.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeEdit, type CalendarEdit, type CalendarImpact } from "@/lib/planning/calendar-change";
import { applyCalendarChange, previewCalendarChange } from "@/lib/planning/calendar-change-service";

const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

type Preview = CalendarImpact & { title: string; activities: number };

export function PlanCalendarImpactDialog({
  projectId, edit, onClose, onSaved,
}: { projectId: string; edit: CalendarEdit | null; onClose: () => void; onSaved: () => void }) {
  const [preview, setPreview] = useState<{ edit: CalendarEdit; data: Preview | null; error: string | null } | null>(null);
  const [saving, setSaving] = useState<"recalc" | "later" | null>(null);

  useEffect(() => {
    if (!edit) return;
    let live = true;
    previewCalendarChange(projectId, edit)
      .then((r) => { if (live) setPreview({ edit, data: { ...r, title: describeEdit(r.set, edit) }, error: null }); })
      .catch((e) => { if (live) setPreview({ edit, data: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [projectId, edit]);

  const current = preview?.edit === edit ? preview : null;
  const p = current?.data ?? null;

  async function save(recalculate: boolean) {
    if (!edit) return;
    setSaving(recalculate ? "recalc" : "later");
    try {
      const r = await applyCalendarChange(projectId, edit, recalculate);
      toast.success(recalculate
        ? `Calendar saved. ${r.written} activit${r.written === 1 ? "y" : "ies"} recalculated.`
        : "Calendar saved. Run Calculate (F9) in the Gantt or Sheet to update the dates.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Saving the calendar failed");
    } finally { setSaving(null); }
  }

  return (
    <Dialog open={!!edit} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{p?.title ?? "Calendar change"}</DialogTitle>
          <DialogDescription>
            What this change does to the programme, calculated from the data date with progress, links and constraints. Nothing is saved yet.
          </DialogDescription>
        </DialogHeader>

        {!current ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculating both versions…</div>
        ) : current.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{current.error}</p>
        ) : p && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Project finish now" value={fmt(p.finishBefore)} />
              <Stat label="After the change" value={fmt(p.finishAfter)} />
              <Stat label="Finish moves" value={`${signed(p.finishDelta)} day(s)`} tone={p.finishDelta > 0 ? "bad" : p.finishDelta < 0 ? "good" : undefined} />
            </div>
            <p className="text-muted-foreground">
              {p.moved.length === 0 ? "No activity moves." : `${p.moved.length} of ${p.activities} activities move.`}
            </p>
            {p.notCalculated > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {p.notCalculated} activit{p.notCalculated === 1 ? "y's" : "ies'"} saved dates already differ from a calculation with today&apos;s calendars (the programme was not recalculated after earlier edits). Recalculating now moves them too.
              </p>
            )}
            {p.milestones.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium">Contract milestones affected</div>
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground"><tr><th className="py-1">Milestone</th><th>Contract</th><th>Forecast now</th><th>After</th></tr></thead>
                  <tbody>
                    {p.milestones.map((m) => (
                      <tr key={m.code} className="border-t border-border">
                        <td className="py-1">{m.code} {m.name}</td><td>{fmt(m.date)}</td><td>{fmt(m.forecastBefore)}</td>
                        <td className={m.forecastAfter && m.forecastAfter > m.date ? "font-medium text-red-600" : ""}>{fmt(m.forecastAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {p.moved.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/70 text-left text-muted-foreground">
                    <tr><th className="px-2 py-1">Activity</th><th className="px-2">Start</th><th className="px-2">Finish</th><th className="px-2 text-right">Days</th></tr>
                  </thead>
                  <tbody>
                    {p.moved.slice(0, 100).map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-2 py-1"><span className="font-mono">{m.code}</span> {m.name}</td>
                        <td className="px-2 whitespace-nowrap">{fmt(m.startBefore)} → {fmt(m.startAfter)}</td>
                        <td className="px-2 whitespace-nowrap">{fmt(m.finishBefore)} → {fmt(m.finishAfter)}</td>
                        <td className="px-2 text-right tabular-nums">{signed(m.finishDelta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {p.moved.length > 100 && <p className="px-2 py-1 text-xs text-muted-foreground">…and {p.moved.length - 100} more.</p>}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={!!saving}>Cancel</Button>
          <Button variant="outline" onClick={() => void save(false)} disabled={!!saving || !p}
            title="Save the calendar; dates stay as they are until the next Calculate (F9)">
            {saving === "later" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save, recalculate later
          </Button>
          <Button onClick={() => void save(true)} disabled={!!saving || !p}>
            {saving === "recalc" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save and recalculate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={tone === "bad" ? "font-semibold text-red-600" : tone === "good" ? "font-semibold text-emerald-600" : "font-semibold"}>{value}</div>
    </div>
  );
}
