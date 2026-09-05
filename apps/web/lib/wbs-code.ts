// Auto-generation of WBS node codes for the WBS Builder grid.
//
// Scheme: a one-letter prefix derived from the node type + a zero-padded
// sequence number that is unique among *same-prefix siblings* (the DB unique
// index is `(project_id, parent_id, wbs_code)`). Codes are still hand-editable
// in the grid — `isAutoCode()` is the heuristic that decides whether an
// existing code is safe to regenerate when the node type changes.
//
// Pure module: no Supabase, no React. Sibling lists are passed in.

export const WBS_CODE_PREFIX: Record<string, string> = {
  phase: "P",
  building: "B",
  level: "L",
  zone: "Z",
  room: "R",
  element: "E",
  discipline: "D",
  task_group: "T",
};

/** Prefix letter for a node type; "N" for anything unmapped. */
export function prefixForNodeType(nodeType: string): string {
  return WBS_CODE_PREFIX[nodeType] ?? "N";
}

const SEQ_PAD = 2;

function seqRegex(prefix: string): RegExp {
  // Escape is unnecessary — every prefix is a single ASCII letter.
  return new RegExp(`^${prefix}(\\d+)$`, "i");
}

/**
 * Next auto code for `nodeType` among `siblings`: `${prefix}${NN}` (zero-padded
 * to 2 digits, grows to 3+ past 99). Sibling codes that don't match
 * `^<prefix>\d+$` are ignored, so hand-typed codes never block the run.
 */
export function nextWbsCode(
  nodeType: string,
  siblings: { wbs_code: string }[],
): string {
  const prefix = prefixForNodeType(nodeType);
  const re = seqRegex(prefix);
  let max = 0;
  for (const s of siblings) {
    const m = re.exec(s.wbs_code ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(SEQ_PAD, "0");
}

/**
 * Resolve a code that must be unique (case-insensitive) among `taken`:
 *  - return `desired` untouched if it's free;
 *  - else, if `desired` ends in digits, bump that numeric tail (B07 -> B08 ...);
 *  - else suffix `-2`, `-3`, ...
 */
export function resolveCodeCollision(desired: string, taken: Set<string>): string {
  const lower = new Set([...taken].map((c) => c.toLowerCase()));
  if (!lower.has(desired.toLowerCase())) return desired;

  const tail = /^(.*?)(\d+)$/.exec(desired);
  if (tail) {
    const stem = tail[1];
    const width = tail[2].length;
    let n = parseInt(tail[2], 10) + 1;
    for (let guard = 0; guard < 10000; guard++) {
      const candidate = stem + String(n).padStart(width, "0");
      if (!lower.has(candidate.toLowerCase())) return candidate;
      n++;
    }
  }

  let n = 2;
  while (lower.has(`${desired}-${n}`.toLowerCase())) n++;
  return `${desired}-${n}`;
}

/**
 * True when `code` still looks like an auto-generated code for `nodeType`
 * (`^<prefix>\d+$`). Used to decide whether a node-type change may regenerate
 * the code — a hand-typed code returns false and is left alone.
 */
export function isAutoCode(code: string, nodeType: string): boolean {
  return seqRegex(prefixForNodeType(nodeType)).test((code ?? "").trim());
}
