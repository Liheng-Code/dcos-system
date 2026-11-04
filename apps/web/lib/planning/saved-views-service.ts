// Saved Sheet / Gantt views (doc 35 U3): a name, a filter and a group-by, per project. Own views, plus the ones
// project members shared. RLS: only the owner changes a view.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupBy, ViewFilter } from "./sheet-view";

export interface SavedView {
  id: string;
  name: string;
  filter: ViewFilter;
  group_by: GroupBy;
  shared: boolean;
  owner_id: string;
  mine: boolean;
}

export async function listSavedViews(db: SupabaseClient, projectId: string): Promise<SavedView[]> {
  const [{ data, error }, { data: auth }] = await Promise.all([
    db.from("plan_saved_views").select("id, name, filter, group_by, shared, owner_id").eq("project_id", projectId).order("name"),
    db.auth.getUser(),
  ]);
  if (error) throw new Error(error.message);
  const me = auth.user?.id ?? null;
  return ((data ?? []) as Omit<SavedView, "mine">[]).map((v) => ({ ...v, filter: cleanFilter(v.filter), mine: v.owner_id === me }));
}

/** A stored filter with only the fields and types the Sheet understands (views are shared, so not trusted). */
export function cleanFilter(raw: unknown): ViewFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    text: str(r.text),
    statuses: Array.isArray(r.statuses) ? r.statuses.filter((x): x is string => typeof x === "string") : undefined,
    incompleteOnly: r.incompleteOnly === true || undefined,
    criticalOnly: r.criticalOnly === true || undefined,
    discipline: str(r.discipline) ?? null,
    owner: str(r.owner) ?? null,
    from: date(r.from),
    to: date(r.to),
  };
}

export async function saveView(
  db: SupabaseClient, projectId: string, view: { id?: string; name: string; filter: ViewFilter; group_by: GroupBy; shared: boolean },
): Promise<void> {
  const row = { name: view.name.trim(), filter: view.filter, group_by: view.group_by, shared: view.shared };
  const { error } = view.id
    ? await db.from("plan_saved_views").update(row).eq("id", view.id)
    : await db.from("plan_saved_views").insert({ project_id: projectId, ...row });
  if (error) throw new Error(error.code === "23505" ? `You already have a view called "${row.name}"` : error.message);
}

export async function deleteView(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from("plan_saved_views").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
