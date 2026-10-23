// Matching company templates (WBS templates, level templates) to a project's sector / building type.
// Pure logic, shared by both libraries. Taxonomy: lib/project-categories.ts.
//
// A template follows a construction pattern: template_category is the sector slug (projects.category)
// and building_types lists the building-type slugs (projects.building_type) it fits. Empty
// building_types = fits any project in its sector.

import { PROJECT_SECTORS, sectorLabel } from "@/lib/project-categories";

export interface TemplateFit {
  template_category: string | null;
  building_types: string[];
}

export interface ProjectKind {
  sector?: string | null;
  buildingType?: string | null;
}

/** 2 = made for this building type, 1 = generic template of the project's sector, 0 = no fit. */
export function templateFit(t: TemplateFit, p: ProjectKind): 0 | 1 | 2 {
  if (p.buildingType && t.building_types.includes(p.buildingType)) return 2;
  if (p.sector && t.template_category === p.sector && t.building_types.length === 0) return 1;
  return 0;
}

/** The best template for a project, or null when none fits. */
export function recommendedTemplate<T extends TemplateFit>(items: T[], p: ProjectKind): T | null {
  let best: T | null = null;
  let bestFit = 0;
  for (const t of items) {
    const f = templateFit(t, p);
    if (f > bestFit) { best = t; bestFit = f; }
  }
  return best;
}

/**
 * Groups templates for a list or picker: "Recommended" (fits the project, best first), then the
 * project's sector, the other sectors in taxonomy order, other categories A–Z, uncategorised last.
 */
export function groupTemplates<T extends TemplateFit>(items: T[], p: ProjectKind = {}): { label: string; recommended: boolean; items: T[] }[] {
  const recommended = items
    .map((t, i) => ({ t, i, f: templateFit(t, p) }))
    .filter((x) => x.f > 0)
    .sort((a, b) => b.f - a.f || a.i - b.i)
    .map((x) => x.t);
  const shown = new Set(recommended);
  const byCategory = new Map<string, T[]>();
  for (const t of items) {
    if (shown.has(t)) continue;
    const c = t.template_category?.trim() ?? "";
    byCategory.set(c, [...(byCategory.get(c) ?? []), t]);
  }
  const order = PROJECT_SECTORS.map((s) => s.value);
  const rank = (c: string) =>
    c === (p.sector ?? null) ? -1 : order.includes(c) ? order.indexOf(c) : c === "" ? Number.MAX_SAFE_INTEGER : order.length;
  const groups = [...byCategory.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([c, list]) => ({ label: c ? sectorLabel(c) : "Uncategorised", recommended: false, items: list }));
  return recommended.length ? [{ label: "Recommended", recommended: true, items: recommended }, ...groups] : groups;
}

// ── Sector lists (activity masters and activity templates) ──────────────────
// A master or floor-cycle template usually serves several sectors, so it carries a sector list
// (empty = every sector) plus the building types it is written for.

export interface SectorListFit {
  sectors: string[];
  building_types: string[];
}

/** The four sectors that are buildings (everything but infrastructure). */
export const BUILDING_SECTORS = ["residential", "commercial", "industrial", "institutional"] as const;

/**
 * 2 = written for the project's building type, 1 = usable in the project's sector (or in every
 * sector), 0 = another sector. With no project sector or building type everything counts as 1.
 */
export function sectorListFit(t: SectorListFit, p: ProjectKind): 0 | 1 | 2 {
  if (p.buildingType && t.building_types.includes(p.buildingType)) return 2;
  if (!p.sector && !p.buildingType) return 1;
  if (t.sectors.length === 0 || (p.sector && t.sectors.includes(p.sector))) return 1;
  return 0;
}

/** "All sectors", "All building sectors" or the sector names. */
export function sectorListLabel(sectors: string[]): string {
  if (sectors.length === 0) return "All sectors";
  if (BUILDING_SECTORS.every((s) => sectors.includes(s)) && sectors.length === BUILDING_SECTORS.length) return "All building sectors";
  return sectors.map((s) => sectorLabel(s)).join(", ");
}

/** Groups for a picker: written for the project's building type, usable in its sector, the rest. */
export function groupBySectorFit<T extends SectorListFit>(items: T[], p: ProjectKind): { label: string; items: T[] }[] {
  if (!p.sector && !p.buildingType) return [{ label: "", items }];
  const by = (f: number) => items.filter((t) => sectorListFit(t, p) === f);
  return [
    { label: "★ Recommended for this project", items: by(2) },
    { label: p.sector ? `Also fits ${sectorLabel(p.sector)}` : "Also fits", items: by(1) },
    { label: "Other sectors", items: by(0) },
  ].filter((g) => g.items.length > 0);
}
