// Module 10-01 Daily Reporting — item-level correction (design §13.5).
// When the PM returns a report, only the items they selected are reopened.
// The server builds the corrected version from the previous version plus the
// reporter's edits to those items; edits anywhere else are discarded, so a
// correction cannot quietly change a part of the report nobody reviewed.

import { LIST_SECTIONS, type CorrectionItem, type DrPayload, type ListSectionKey, type SectionKey } from "./types";

const isListSection = (s: SectionKey): s is ListSectionKey => (LIST_SECTIONS as readonly string[]).includes(s);

/** True when the reporter may edit this section (or this line of it). */
export function isEditable(items: Pick<CorrectionItem, "target_section" | "target_line_id">[], section: SectionKey, lineId?: string): boolean {
  return items.some(
    (i) => i.target_section === section && (!i.target_line_id || lineId === undefined || i.target_line_id === lineId),
  );
}

/** True when the whole section (not just single lines) was returned. */
export function isSectionOpen(items: Pick<CorrectionItem, "target_section" | "target_line_id">[], section: SectionKey): boolean {
  return items.some((i) => i.target_section === section && !i.target_line_id);
}

type Line = { line_id: string };

export function applyCorrection(
  previous: DrPayload,
  edited: DrPayload,
  items: Pick<CorrectionItem, "target_section" | "target_line_id">[],
): DrPayload {
  const out: DrPayload = structuredClone(previous);
  const target = out as unknown as Record<string, unknown>;
  const source = edited as unknown as Record<string, unknown>;

  const sections = new Set(items.map((i) => i.target_section));
  for (const section of sections) {
    if (section === "evidence") continue; // evidence travels beside the payload

    if (!isListSection(section) || isSectionOpen(items, section)) {
      target[section] = structuredClone(source[section]);
      continue;
    }

    // Only the named lines are replaced; a named line the reporter removed is
    // dropped, and lines that were never returned stay as they were.
    const lineIds = new Set(items.filter((i) => i.target_section === section).map((i) => i.target_line_id as string));
    const editedLines = new Map(((source[section] as Line[]) ?? []).map((l) => [l.line_id, l]));
    target[section] = ((target[section] as Line[]) ?? []).flatMap((line) => {
      if (!lineIds.has(line.line_id)) return [line];
      const replacement = editedLines.get(line.line_id);
      return replacement ? [structuredClone(replacement)] : [];
    });
  }
  return out;
}
