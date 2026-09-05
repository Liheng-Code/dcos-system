import { createClient } from "@/lib/supabase/client";
import { addWorkingDays, parseISO, type WorkCalendar } from "@/lib/planning/work-calendar";

const DAY_MS = 86_400_000;

export interface MoveProjectOpts {
  /** Current earliest task start (ISO). */
  currentStart: string;
  /** New project start (ISO) — mutually exclusive with `shiftWorkingDays`. */
  newStart?: string;
  /** Shift by N working days (may be negative). */
  shiftWorkingDays?: number;
  shiftConstraints: boolean;
  shiftBaseline: boolean;
  calendar: WorkCalendar;
}

/** Calendar-day delta a set of Move Project options resolves to. */
export function resolveMoveDelta(opts: MoveProjectOpts): number {
  if (opts.newStart) {
    return Math.round(
      (parseISO(opts.newStart).getTime() - parseISO(opts.currentStart).getTime()) / DAY_MS,
    );
  }
  const n = opts.shiftWorkingDays ?? 0;
  if (n === 0) return 0;
  const target = addWorkingDays(opts.calendar, opts.currentStart, n);
  return Math.round(
    (parseISO(target).getTime() - parseISO(opts.currentStart).getTime()) / DAY_MS,
  );
}

/** Shift every task in the project by the resolved calendar-day delta. Returns rows moved. */
export async function moveProject(
  projectId: string,
  opts: MoveProjectOpts,
): Promise<{ delta: number; moved: number }> {
  const delta = resolveMoveDelta(opts);
  if (delta === 0) return { delta: 0, moved: 0 };
  const { data, error } = await createClient().rpc("move_project", {
    p_project_id: projectId,
    p_delta_days: delta,
    p_shift_constraints: opts.shiftConstraints,
    p_shift_baseline: opts.shiftBaseline,
  });
  if (error) throw new Error(error.message);
  return { delta, moved: (data as number) ?? 0 };
}
