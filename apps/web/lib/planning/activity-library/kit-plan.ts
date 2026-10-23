// Generation kits (Generate plan G2/G3): pure rules, no database access.
// A kit says which activity template goes on each part of a building pattern; kit items name templates by code
// (supabase/migrations/20261021000022_generation_kits.sql). Data access: kit-service.ts.

import { sectorListFit, type ProjectKind } from "@/lib/template-fit";
import type { LibraryStatus } from "./types";

export const KIT_PARTS = ["basement", "ground", "podium", "mezzanine", "typical", "roof", "segment", "site"] as const;
export type KitPart = (typeof KIT_PARTS)[number];

export interface Kit {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: LibraryStatus;
  version: number;
  supersedes_id: string | null;
  sectors: string[];
  building_types: string[];
  updated_at?: string;
}

export interface KitItem {
  id?: string;
  part: KitPart;
  template_code: string;
  /** empty = every building type of the kit */
  building_types: string[];
  sort_order: number;
}

/** The fields of a template version these rules look at. */
export interface TemplateRef {
  id: string;
  code: string;
  name: string;
  version: number;
  status: string;
  applies_to_level_types: string[];
}

const usable = (s: string) => s === "active" || s === "approved";

/** The version of a template code Generate uses: active, else approved, else the newest draft / under review. */
export function pickTemplateVersion<T extends TemplateRef>(templates: T[], code: string): T | null {
  const versions = templates.filter((t) => t.code === code && t.status !== "superseded" && t.status !== "archived");
  const rank = (t: T) => (t.status === "active" ? 0 : t.status === "approved" ? 1 : 2);
  return [...versions].sort((a, b) => rank(a) - rank(b) || b.version - a.version)[0] ?? null;
}

/**
 * Template versions the kit puts on one part for this building type, in kit order. `fits` (a template's
 * conditions against the planning choices) picks between alternatives on a part, e.g. a pitched or a flat roof:
 * when some fit, the others are dropped; when none fit, all stay so the planner sees why.
 */
export function templatesForPart<T extends TemplateRef>(
  items: KitItem[], part: string, buildingType: string | null | undefined, templates: T[], fits?: (t: T) => boolean,
): T[] {
  const out: T[] = [];
  for (const it of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
    if (it.part !== part) continue;
    if (it.building_types.length > 0 && (!buildingType || !it.building_types.includes(buildingType))) continue;
    const t = pickTemplateVersion(templates, it.template_code);
    if (t && !out.some((x) => x.id === t.id)) out.push(t);
  }
  if (!fits) return out;
  const fitting = out.filter(fits);
  return fitting.length > 0 ? fitting : out;
}

/** Template ids per target node: each node gets the kit's templates for its part (see templatesForPart). */
export function assignTemplates<T extends TemplateRef>(
  nodes: { id: string; part: string | null }[], items: KitItem[], buildingType: string | null | undefined, templates: T[],
  fits?: (t: T) => boolean,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const n of nodes) out[n.id] = n.part ? templatesForPart(items, n.part, buildingType, templates, fits).map((t) => t.id) : [];
  return out;
}

/** Best kit for the project: written for its building type, then its sector; approved / active before drafts. */
export function recommendedKit<K extends Pick<Kit, "sectors" | "building_types" | "status" | "code">>(kits: K[], kind: ProjectKind): K | null {
  const live = kits.filter((k) => k.status !== "superseded" && k.status !== "archived");
  const ranked = [...live].sort((a, b) =>
    sectorListFit(b, kind) - sectorListFit(a, kind) || Number(usable(b.status)) - Number(usable(a.status)) || a.code.localeCompare(b.code));
  const top = ranked[0];
  return top && sectorListFit(top, kind) > 0 && (kind.sector || kind.buildingType) ? top : null;
}

/** Why a kit preview cannot be generated (empty = it can): drafts are preview-only. */
export function generateBlockers(kit: Pick<Kit, "code" | "status"> | null, templates: Pick<TemplateRef, "code" | "status">[]): string[] {
  const out: string[] = [];
  if (kit && !usable(kit.status)) out.push(`Kit ${kit.code} is ${kit.status}`);
  for (const t of templates) if (!usable(t.status)) out.push(`Template ${t.code} is ${t.status}`);
  return out;
}

export interface ScopeNode { id: string; parent_id: string | null; node_type: string | null; wbs_name: string; wbs_code: string | null }
export interface ScopeGroup<N> { key: string; label: string; nodes: N[] }

/**
 * Groups target levels / sections by the building (nearest building ancestor) or route (a section's parent)
 * they belong to, keeping the given node order inside each group and groups in first-seen order.
 */
export function groupScope<N extends { id: string; node_type?: string | null }>(targets: N[], tree: ScopeNode[]): ScopeGroup<N>[] {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const owner = (t: N): ScopeNode | null => {
    const self = byId.get(t.id);
    if (!self) return null;
    if (t.node_type === "segment" || self.node_type === "segment") return self.parent_id ? byId.get(self.parent_id) ?? null : null;
    let cur = self.parent_id ? byId.get(self.parent_id) : undefined;
    for (let guard = 0; cur && guard < tree.length; guard++) {
      if (cur.node_type === "building") return cur;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return null;
  };
  const groups = new Map<string, ScopeGroup<N>>();
  for (const t of targets) {
    const o = owner(t);
    const key = o?.id ?? "_project";
    if (!groups.has(key)) groups.set(key, { key, label: o ? [o.wbs_code, o.wbs_name].filter(Boolean).join(" · ") : "Project-wide / site", nodes: [] });
    groups.get(key)!.nodes.push(t);
  }
  return [...groups.values()];
}
