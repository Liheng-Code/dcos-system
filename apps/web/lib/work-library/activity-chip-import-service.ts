// Chip links for the Construction Work Library Excel import / export (sheet "Chip links"): resolve library codes,
// find existing links, write new ones. Chip links are catalogue knowledge, so they are written at any master status
// (unlike BOQ links); an existing link is left as it is. RLS (can_manage_master_libraries()) guards every write.

import type { SupabaseClient } from "@supabase/supabase-js";
import { inChunks } from "@/lib/supabase/in-chunks";
import type { ChipKind } from "./activity-chips-rules";
import type { ImportChip } from "./activity-database-import";

type Db = SupabaseClient;

/** Link table and its reference column, and the library each code is looked up in. */
export const CHIP_SOURCES: Record<ChipKind, { link: string; ref: string; library: string }> = {
  procurement_package: { link: "plan_act_master_procurement_packages", ref: "package_id", library: "plan_act_procurement_packages" },
  method_statement: { link: "plan_act_master_method_statements", ref: "method_statement_id", library: "plan_act_method_statements" },
  material: { link: "plan_act_master_materials", ref: "resource_id", library: "dwl_resources" },
  shop_drawing: { link: "plan_act_master_shop_drawings", ref: "shop_drawing_type_id", library: "plan_act_shop_drawing_types" },
  coordination: { link: "plan_act_master_coordination", ref: "coordination_item_id", library: "plan_act_coordination_items" },
  tc: { link: "plan_act_master_tc_items", ref: "tc_item_id", library: "plan_act_tc_items" },
};
export const CHIP_KINDS = Object.keys(CHIP_SOURCES) as ChipKind[];

const key = (kind: ChipKind, code: string) => `${kind}|${code.toUpperCase()}`;

/** "kind|CODE" -> library item id, for the codes in the file (materials: QS material resources only). */
export async function resolveChipCodes(db: Db, chips: readonly ImportChip[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(CHIP_KINDS.map(async (kind) => {
    const codes = [...new Set(chips.filter((c) => c.kind === kind).flatMap((c) => [c.code, c.code.toUpperCase()]))];
    if (!codes.length) return;
    const rows = await inChunks<{ id: string; code: string }>(codes, (p) => {
      const qb = db.from(CHIP_SOURCES[kind].library).select("id, code").in("code", p);
      return kind === "material" ? qb.eq("category", "material") : qb;
    });
    for (const r of rows) out.set(key(kind, r.code), r.id);
  }));
  return out;
}

export function chipItemId(ids: Map<string, string>, c: Pick<ImportChip, "kind" | "code">): string | undefined {
  return ids.get(key(c.kind, c.code));
}

/** Existing links of these masters as "kind|master|item". */
export async function existingChipLinks(db: Db, masterIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!masterIds.length) return out;
  await Promise.all(CHIP_KINDS.map(async (kind) => {
    const { link, ref } = CHIP_SOURCES[kind];
    const rows = await inChunks<Record<string, string>>([...masterIds], (p) => db.from(link).select("*").in("master_id", p));
    for (const r of rows) out.add(`${kind}|${r.master_id}|${r[ref]}`);
  }));
  return out;
}

/**
 * Inserts the links that do not exist yet, after each master's current links (sort_order). Returns how many were
 * written and the error of any kind whose insert failed (its rows count as skipped).
 */
export async function writeChipLinks(
  db: Db, rows: readonly { kind: ChipKind; masterId: string; itemId: string }[],
): Promise<{ written: number; failed: { kind: ChipKind; count: number; message: string }[] }> {
  let written = 0;
  const failed: { kind: ChipKind; count: number; message: string }[] = [];
  for (const kind of CHIP_KINDS) {
    const mine = rows.filter((r) => r.kind === kind);
    if (!mine.length) continue;
    const { link, ref } = CHIP_SOURCES[kind];
    const masters = [...new Set(mine.map((r) => r.masterId))];
    const current = await inChunks<{ master_id: string; sort_order: number | null }>(masters, (p) => db.from(link).select("master_id, sort_order").in("master_id", p));
    const next = new Map<string, number>();
    for (const c of current) next.set(c.master_id, Math.max(next.get(c.master_id) ?? 0, c.sort_order ?? 0));
    const payload = mine.map((r) => {
      const n = (next.get(r.masterId) ?? 0) + 10;
      next.set(r.masterId, n);
      return { master_id: r.masterId, [ref]: r.itemId, sort_order: n };
    });
    for (let i = 0; i < payload.length; i += 200) {
      const part = payload.slice(i, i + 200);
      const { error } = await db.from(link).upsert(part, { onConflict: `master_id,${ref}`, ignoreDuplicates: true });
      if (error) failed.push({ kind, count: part.length, message: error.message });
      else written += part.length;
    }
  }
  return { written, failed };
}

/** Every chip link of these masters with its library code, for the export ("kind" -> master id -> codes). */
export async function chipCodesForMasters(db: Db, masterIds: readonly string[]): Promise<{ kind: ChipKind; masterId: string; code: string }[]> {
  const out: { kind: ChipKind; masterId: string; code: string }[] = [];
  await Promise.all(CHIP_KINDS.map(async (kind) => {
    const { link, ref, library } = CHIP_SOURCES[kind];
    const links = await inChunks<Record<string, string | number | null>>([...masterIds], (p) =>
      db.from(link).select("*").in("master_id", p));
    const ids = [...new Set(links.map((l) => String(l[ref])))];
    const codes = new Map((await inChunks<{ id: string; code: string }>(ids, (p) => db.from(library).select("id, code").in("id", p))).map((r) => [r.id, r.code]));
    for (const l of [...links].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))) {
      const code = codes.get(String(l[ref]));
      if (code) out.push({ kind, masterId: String(l.master_id), code });
    }
  }));
  return out;
}
