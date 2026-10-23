// Pure helpers for the Activity Database detail chips (shop drawings, materials, coordination) and the Details display.

export type ChipKind = "shop_drawing" | "material" | "coordination" | "method_statement" | "tc";

export const TC_TYPES = ["inspection", "test", "commissioning"] as const;
export type TcType = (typeof TC_TYPES)[number];
export const TC_TYPE_LABEL: Record<TcType, string> = { inspection: "Inspection", test: "Test", commissioning: "Commissioning" };

/** True for an http(s) URL, so a reference document can be shown as a link. */
export function isHttpUrl(s: string | null | undefined): boolean {
  return /^https?:\/\/\S+$/i.test((s ?? "").trim());
}

/** Material name: the material attribute name when set, else the resource description. */
export function materialDisplayName(materialName: string | null | undefined, description: string | null | undefined): string {
  const a = (materialName ?? "").trim();
  return a || (description ?? "").trim();
}

/** Shop drawing types of the activity's division first, then the rest; each group by code. */
export function sortShopDrawingsForDivision<T extends { code: string; csi_division_code: string | null }>(rows: T[], divisionCode: string | null): T[] {
  const rank = (r: T) => (divisionCode && r.csi_division_code === divisionCode ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
}

/** Next free library code: highest numeric suffix after `prefix` plus one, zero padded ("SD-04-" + [01, 02] -> "SD-04-03"). */
export function suggestNextCode(existing: readonly string[], prefix: string, width = 2): string {
  let max = 0;
  for (const c of existing) {
    if (!c.startsWith(prefix)) continue;
    const tail = c.slice(prefix.length);
    if (/^\d+$/.test(tail)) max = Math.max(max, Number(tail));
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

/** "Division 04 - Masonry", or "-" when there is no division. */
export function divisionLabel(code: string | null | undefined, name: string | null | undefined): string {
  if (!code) return "-";
  return name ? `Division ${code} - ${name}` : `Division ${code}`;
}

/** "04 20 00 - Unit Masonry", or "-" when there is no section. */
export function sectionLabel(code: string | null | undefined, name: string | null | undefined): string {
  if (!code) return "-";
  return name ? `${code} - ${name}` : code;
}

/** "2 %" style value for a percentage input string; "-" when empty. */
export function percentLabel(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s === "" ? "-" : `${s}%`;
}

/** Any library row type with a CSI division: same-division rows first. */
export const sortByDivision = sortShopDrawingsForDivision;

/** Counts how many times each key occurs. */
export function countBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return m;
}
