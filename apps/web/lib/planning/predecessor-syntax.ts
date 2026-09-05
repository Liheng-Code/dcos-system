// MS-Project "Predecessors" cell syntax — e.g.  "3FS+2d, 7SS-1d, 12".
//
// Tokens are keyed on the grid's # column (row number), exactly like MS Project's
// ID column, with a task_code fallback so "T0003FF" also works. A bare number is
// a Finish-to-Start link with zero lag and prints back as just the number.

import { isDepType, type DepType, type EngineDep } from "./schedule-engine";

/** "3FS+2d, 7SS-1d" — a plain FS with no lag collapses to just the row number. */
export function formatPredecessors(
  deps: EngineDep[],
  rowNumberByTaskId: Map<string, number>,
): string {
  return deps
    .map((d) => {
      const n = rowNumberByTaskId.get(d.predId);
      if (n === undefined) return null; // predecessor not visible in this grid
      if (d.type === "fs" && !d.lag) return String(n);
      const lag = d.lag ? (d.lag > 0 ? `+${d.lag}d` : `${d.lag}d`) : "";
      return `${n}${d.type.toUpperCase()}${lag}`;
    })
    .filter((s): s is string => s !== null)
    .join(", ");
}

// <ref><type?><lag?>   ref = digits (row no.) or a task code; lag = ±n with optional "d"
// Case-insensitive so "3fs+2d" and "3FS+2D" both parse.
const TOKEN_RE =
  /^([A-Za-z0-9_.\-]+?)(FS|SS|FF|SF)?([+-]\s*\d+(?:\.\d+)?)\s*D?$|^([A-Za-z0-9_.\-]+?)(FS|SS|FF|SF)?$/i;

export interface ParseResult {
  deps: EngineDep[];
  errors: string[];
}

export function parsePredecessors(
  raw: string,
  taskIdByRowNumber: Map<number, string>,
  taskIdByCode: Map<string, string>,
  selfId: string,
): ParseResult {
  const deps: EngineDep[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const tokens = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const compact = token.replace(/\s+/g, "");
    const m = TOKEN_RE.exec(compact);
    if (!m) {
      errors.push(`"${token}" isn't a valid predecessor`);
      continue;
    }
    const ref = (m[1] ?? m[4] ?? "").trim();
    const rawType = (m[2] ?? m[5] ?? "fs").toLowerCase();
    const lag = m[3] ? Number(m[3].replace(/\s+/g, "")) : 0;

    if (!ref) {
      errors.push(`"${token}" is missing a task reference`);
      continue;
    }

    let predId: string | undefined;
    if (/^\d+$/.test(ref)) {
      predId = taskIdByRowNumber.get(Number(ref));
      if (!predId) {
        errors.push(`Row ${ref} isn't a task in this schedule`);
        continue;
      }
    } else {
      predId = taskIdByCode.get(ref.toUpperCase());
      if (!predId) {
        errors.push(`No task with code "${ref}"`);
        continue;
      }
    }

    if (predId === selfId) {
      errors.push("A task can't depend on itself");
      continue;
    }
    if (seen.has(predId)) {
      errors.push(`"${ref}" is listed more than once`);
      continue;
    }
    if (!Number.isFinite(lag)) {
      errors.push(`"${token}" has an invalid lag`);
      continue;
    }

    seen.add(predId);
    deps.push({
      predId,
      type: (isDepType(rawType) ? rawType : "fs") as DepType,
      lag: Math.trunc(lag),
    });
  }

  return { deps, errors };
}
