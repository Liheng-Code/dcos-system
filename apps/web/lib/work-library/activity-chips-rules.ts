// Pure helpers for the Construction Work Library detail chips (shop drawings, materials, coordination, method statements,
// T&C, procurement packages) and the Details display.

export type ChipKind = "shop_drawing" | "material" | "coordination" | "method_statement" | "tc" | "procurement_package";

export const TC_TYPES = ["inspection", "test", "commissioning"] as const;
export type TcType = (typeof TC_TYPES)[number];
export const TC_TYPE_LABEL: Record<TcType, string> = { inspection: "Inspection", test: "Test", commissioning: "Commissioning" };

export const PACKAGE_TYPES = ["material", "subcontract", "equipment", "service"] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];
export const PACKAGE_TYPE_LABEL: Record<PackageType, string> = { material: "Material supply", subcontract: "Subcontract", equipment: "Equipment", service: "Service" };

/** "Rebar Supply & Bending (PKG-STR-REBAR-01)": a package as shown in pickers and lists. */
export function packageLabel(p: { code: string; name: string }): string {
  return p.name && p.name !== p.code ? `${p.name} (${p.code})` : p.code;
}

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

/** Division-pane bucket for library items that have no CSI division. */
export const NO_DIVISION = "__none__";

/** Items per CSI division code; an item in several divisions counts in each, one in none counts under NO_DIVISION. */
export function countByDivision<T>(rows: readonly T[], divisionsOf: (r: T) => readonly (string | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const codes = [...new Set(divisionsOf(r).filter((c): c is string => !!c))];
    for (const c of codes.length ? codes : [NO_DIVISION]) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

/** True when an item with these division codes belongs to the selected pane bucket (null = all). */
export function inDivision(codes: readonly (string | null)[], selected: string | null): boolean {
  if (selected === null) return true;
  const real = codes.filter((c): c is string => !!c);
  return selected === NO_DIVISION ? real.length === 0 : real.includes(selected);
}

/**
 * The one package every line leads to, or null. Lines that lead to no package are ignored; any line with two or more
 * packages, or lines that disagree, give null (the buyer picks).
 */
export function commonPackage(packagesPerLine: readonly (readonly string[])[]): string | null {
  let found: string | null = null;
  for (const pkgs of packagesPerLine) {
    const unique = [...new Set(pkgs)];
    if (unique.length === 0) continue;
    if (unique.length > 1) return null;
    if (found && found !== unique[0]) return null;
    found = unique[0];
  }
  return found;
}

/** Packages to offer first: those linked to the PR's activities, then the rest; each group by code. */
export function rankPackages<T extends { id: string; code: string }>(rows: readonly T[], preferredIds: ReadonlySet<string>): T[] {
  const rank = (r: T) => (preferredIds.has(r.id) ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
}
