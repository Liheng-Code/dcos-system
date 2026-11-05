// Loads an Activity Master version and the version it supersedes, and compares them (Work Library "Changes" tab).
// Norms stay on the old version until the new one is activated (trigger plan_act_master_repoint_on_activate), so the
// comparison shows the norms that will move, not a difference.

import type { SupabaseClient } from "@supabase/supabase-js";
import { inChunks } from "@/lib/supabase/in-chunks";
import { diffFields, diffList, type FieldChange, type ListDiff } from "./version-diff";

type Db = SupabaseClient;

const FIELD_COLS = "id, code, version, status, name, description, default_unit, activity_type, duration_basis, min_duration_pct, max_duration_pct, crew_size, hours_per_day, csi_section_code, trade, supersedes_id";

interface Snapshot {
  master: Record<string, unknown> & { id: string; version: number; status: string; supersedes_id: string | null };
  methods: { code: string; name: string; is_default: boolean }[];
  boq: { code: string; days: number | null; share: number }[];
  logic: { dir: "pred" | "succ"; other: string; relation: string; lag: number }[];
  requirements: { kind: string; title: string; is_mandatory: boolean }[];
  quantityRules: { name: string; metric_code: string; unit: string | null }[];
}

export interface VersionComparison {
  previous: { id: string; version: number; status: string };
  current: { version: number; status: string };
  fields: FieldChange[];
  methods: ListDiff; boqLinks: ListDiff; logic: ListDiff; requirements: ListDiff; quantityRules: ListDiff;
  /** Library norms still on the previous version; they move to this one when it is activated. */
  normsToMove: { code: string; output: number | null; unit: string }[];
}

function must(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function snapshot(db: Db, id: string): Promise<Snapshot | null> {
  const { data: m, error } = await db.from("plan_act_masters").select(FIELD_COLS).eq("id", id).maybeSingle();
  must(error);
  if (!m) return null;
  const [methods, links, logic, reqs, qrules] = await Promise.all([
    db.from("plan_act_methods").select("code, name, is_default").eq("master_id", id),
    db.from("plan_act_master_work_items").select("work_item_id, duration_days_per_unit, share_pct").eq("master_id", id),
    db.from("plan_act_logic_rules").select("predecessor_master_id, successor_master_id, relation, lag_days").or(`predecessor_master_id.eq.${id},successor_master_id.eq.${id}`),
    db.from("plan_act_requirements").select("kind, title, is_mandatory").eq("master_id", id),
    db.from("plan_act_quantity_rules").select("name, metric_code, unit").eq("master_id", id),
  ]);
  for (const r of [methods, links, logic, reqs, qrules]) must(r.error);
  type LinkRow = { work_item_id: string; duration_days_per_unit: number | null; share_pct: number };
  type LogicRow = { predecessor_master_id: string; successor_master_id: string; relation: string; lag_days: number };
  const linkRows = (links.data ?? []) as LinkRow[];
  const logicRows = (logic.data ?? []) as LogicRow[];
  const wi = new Map((await inChunks<{ id: string; code: string }>(linkRows.map((l) => l.work_item_id), (p) => db.from("dwl_work_items").select("id, code").in("id", p))).map((w) => [w.id, w.code]));
  const others = logicRows.map((r) => (r.predecessor_master_id === id ? r.successor_master_id : r.predecessor_master_id));
  const oc = new Map((await inChunks<{ id: string; code: string; visible_code: string | null }>(others, (p) => db.from("plan_act_masters").select("id, code, visible_code").in("id", p))).map((o) => [o.id, o.visible_code ?? o.code]));
  return {
    master: m as Snapshot["master"],
    methods: (methods.data ?? []) as Snapshot["methods"],
    boq: linkRows.map((l) => ({ code: wi.get(l.work_item_id) ?? l.work_item_id, days: l.duration_days_per_unit, share: Number(l.share_pct) })),
    logic: logicRows.map((r) => {
      const pred = r.successor_master_id === id;
      return { dir: pred ? "pred" : "succ", other: oc.get(pred ? r.predecessor_master_id : r.successor_master_id) ?? "?", relation: r.relation, lag: Number(r.lag_days ?? 0) };
    }),
    requirements: (reqs.data ?? []) as Snapshot["requirements"],
    quantityRules: (qrules.data ?? []) as Snapshot["quantityRules"],
  };
}

/** Null when the activity does not supersede another version. */
export async function compareWithPrevious(db: Db, masterId: string): Promise<VersionComparison | null> {
  const cur = await snapshot(db, masterId);
  if (!cur?.master.supersedes_id) return null;
  const prev = await snapshot(db, cur.master.supersedes_id);
  if (!prev) return null;
  const { data: norms, error } = await db.from("plan_productivity_norms").select("code, output_per_day, unit")
    .eq("activity_master_id", prev.master.id).is("project_id", null).neq("status", "retired");
  must(error);
  const rel = (r: Snapshot["logic"][number]) => `${r.relation.toUpperCase()}${r.lag ? ` ${r.lag > 0 ? "+" : ""}${r.lag}d` : ""}`;
  return {
    previous: { id: prev.master.id, version: prev.master.version, status: prev.master.status },
    current: { version: cur.master.version, status: cur.master.status },
    fields: diffFields(prev.master, cur.master),
    methods: diffList(prev.methods, cur.methods, (x) => x.code, (x) => `${x.code} ${x.name}`, (x) => (x.is_default ? "default" : "")),
    boqLinks: diffList(prev.boq, cur.boq, (x) => x.code, (x) => x.code, (x) => `${x.days ?? "-"} days/unit, ${x.share}%`),
    logic: diffList(prev.logic, cur.logic, (x) => `${x.dir}|${x.other}`, (x) => `${x.dir === "pred" ? "Predecessor" : "Successor"} ${x.other}`, rel),
    requirements: diffList(prev.requirements, cur.requirements, (x) => `${x.kind}|${x.title}`, (x) => `${x.kind}: ${x.title}`, (x) => (x.is_mandatory ? "mandatory" : "optional")),
    quantityRules: diffList(prev.quantityRules, cur.quantityRules, (x) => x.name, (x) => x.name, (x) => `${x.metric_code}${x.unit ? ` (${x.unit})` : ""}`),
    normsToMove: ((norms ?? []) as { code: string; output_per_day: number | null; unit: string }[]).map((n) => ({ code: n.code, output: n.output_per_day === null ? null : Number(n.output_per_day), unit: n.unit })),
  };
}
