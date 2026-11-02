// Fingerprint of a schedule calculation's input (doc 35 E6). Saved with the result in
// plan_schedule_calculations, so a stored programme can be checked for reproducibility: the same
// fingerprint and engine version must give the same dates. Independent of task order and of how the
// caller built its maps.

import type { WorkCalendar } from "./work-calendar";
import type { EngineTask, FloatThresholds, ScheduleOptions } from "./schedule-engine";
import { ENGINE_VERSION } from "./version";

function calendarKey(cal: WorkCalendar) {
  return {
    workdays: cal.workdays.map((w) => (w ? 1 : 0)).join(""),
    hoursPerDay: cal.hoursPerDay ?? null,
    exceptions: [...cal.exceptions.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  };
}

function taskKey(t: EngineTask) {
  return [
    t.id, t.start, t.finish, Math.trunc(t.durationWd), t.elapsed ? 1 : 0, t.manuallyScheduled ? 1 : 0,
    t.constraintType, t.constraintDate, t.calendarId ?? null,
    t.actualStart ?? null, t.actualFinish ?? null, t.remainingWd ?? null, t.percentComplete ?? null,
    t.deps.map((d) => [d.predId, d.type, d.lag]),
  ];
}

/** 53-bit string hash (cyrb53), run with two seeds for a 106-bit fingerprint. */
function cyrb53(str: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** The canonical input text the fingerprint is taken over (exported for debugging). */
export function scheduleInputCanonical(
  tasks: EngineTask[],
  cal: WorkCalendar,
  projectStart: string,
  thresholds: FloatThresholds,
  opts: ScheduleOptions = {},
): string {
  const calendars = opts.calendars
    ? [...opts.calendars.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, c]) => [id, calendarKey(c)])
    : [];
  return JSON.stringify({
    engine: ENGINE_VERSION,
    projectStart,
    thresholds: [thresholds.critical, thresholds.nearCritical],
    calendar: calendarKey(cal),
    calendars,
    options: [opts.dataDate ?? null, opts.lagCalendar ?? "predecessor", opts.mustFinishBy ?? null, opts.completionTaskId ?? null],
    tasks: [...tasks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(taskKey),
  });
}

/** Fingerprint of everything that decides the result, including the engine version. */
export function scheduleInputHash(
  tasks: EngineTask[],
  cal: WorkCalendar,
  projectStart: string,
  thresholds: FloatThresholds,
  opts: ScheduleOptions = {},
): string {
  const text = scheduleInputCanonical(tasks, cal, projectStart, thresholds, opts);
  return cyrb53(text, 0) + cyrb53(text, 1);
}
