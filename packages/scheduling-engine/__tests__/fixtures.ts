// Shared fixtures for the engine reference suite (doc 35 E8).
import type { WorkCalendar } from "../src/work-calendar";
import type { EngineDep, EngineTask } from "../src/schedule-engine";

/** Monday–Friday, no holidays: the calendar every hand calculation below uses unless stated. */
export const MON_FRI: WorkCalendar = {
  id: "mon-fri",
  name: "Mon–Fri",
  workdays: [false, true, true, true, true, true, false],
  exceptions: new Map(),
};

export function task(id: string, durationWd: number, deps: EngineDep[] = [], extra: Partial<EngineTask> = {}): EngineTask {
  return { id, start: null, finish: null, durationWd, manuallyScheduled: false, constraintType: null, constraintDate: null, deps, ...extra };
}

export const fs = (predId: string, lag = 0): EngineDep => ({ predId, type: "fs", lag });
export const ss = (predId: string, lag = 0): EngineDep => ({ predId, type: "ss", lag });
export const ff = (predId: string, lag = 0): EngineDep => ({ predId, type: "ff", lag });
export const sf = (predId: string, lag = 0): EngineDep => ({ predId, type: "sf", lag });

/**
 * A deterministic network of `n` activities: 50 parallel chains (one per building zone), each
 * activity linked FS to the previous one in its chain and, every 7th, SS+2 to the same position in
 * the neighbouring chain. Durations 1–10 working days.
 */
export function largeNetwork(n: number): EngineTask[] {
  const chains = 50;
  const out: EngineTask[] = [];
  for (let i = 0; i < n; i++) {
    const deps: EngineDep[] = [];
    if (i >= chains) deps.push(fs(`t${i - chains}`));
    if (i % 7 === 0 && i >= chains + 1) deps.push(ss(`t${i - chains - 1}`, 2));
    out.push(task(`t${i}`, 1 + ((i * 37) % 10), deps));
  }
  return out;
}
