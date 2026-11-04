"use client";

// Doc 35 I8: who is responsible for each part of the WBS (wbs_nodes.responsible_id), chosen from the project's
// members. Shown in the WBS Excel export.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { createClient } from "@/lib/supabase/client";

interface Node { id: string; parent_id: string | null; wbs_code: string | null; wbs_outline_code: string | null; wbs_name: string; sort_order: number | null; responsible_id: string | null }
interface Member { user_id: string; name: string }

const sel = "h-8 w-56 rounded-md border border-input bg-background px-2 text-xs";

export function PlanWbsResponsibility() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId: projectId } = useProject();
  const { canEditSchedule } = usePlanningPermissions();
  const [data, setData] = useState<{ projectId: string; nodes: Node[]; members: Member[] } | null>(null);
  const [depth, setDepth] = useState(2);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!projectId) return;
    Promise.all([
      db.from("wbs_nodes").select("id, parent_id, wbs_code, wbs_outline_code, wbs_name, sort_order, responsible_id").eq("project_id", projectId).limit(5000),
      db.from("project_members").select("user_id, profiles(full_name, email)").eq("project_id", projectId),
    ]).then(([n, m]) => {
      if (n.error) throw new Error(n.error.message);
      const members = ((m.data ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[])
        .map((r) => ({ user_id: r.user_id, name: r.profiles?.full_name || r.profiles?.email || r.user_id.slice(0, 8) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setData({ projectId, nodes: (n.data ?? []) as Node[], members });
    }).catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [db, projectId]);
  useEffect(load, [load]);

  const current = data?.projectId === projectId ? data : null;
  const flat = useMemo(() => {
    if (!current) return [];
    const kids = new Map<string | null, Node[]>();
    for (const n of current.nodes) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n]);
    for (const l of kids.values()) l.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.wbs_code ?? "").localeCompare(b.wbs_code ?? ""));
    const out: { n: Node; level: number }[] = [];
    const walk = (p: string | null, level: number) => {
      for (const n of kids.get(p) ?? []) { out.push({ n, level }); walk(n.id, level + 1); }
    };
    walk(null, 1);
    return out;
  }, [current]);
  const term = q.trim().toLowerCase();
  const shown = flat.filter(({ n, level }) => term
    ? `${n.wbs_outline_code ?? n.wbs_code ?? ""} ${n.wbs_name}`.toLowerCase().includes(term)
    : level <= depth);
  const names = new Map((current?.members ?? []).map((m) => [m.user_id, m.name]));

  async function assign(node: Node, userId: string | null) {
    setSaving(node.id);
    const { error } = await db.from("wbs_nodes").update({ responsible_id: userId }).eq("id", node.id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    setData((d) => d && { ...d, nodes: d.nodes.map((x) => (x.id === node.id ? { ...x, responsible_id: userId } : x)) });
  }

  if (!projectId) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">WBS responsibility</h2>
          <p className="text-xs text-muted-foreground">The person responsible for each part of the work. Choose from the project members above.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Input className="h-8 w-56" placeholder="Search WBS" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1">Levels
            <select className="h-8 rounded-md border border-input bg-background px-2" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 10].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
      </div>
      {!current ? <Loader2 className="h-4 w-4 animate-spin" /> : flat.length === 0 ? <p className="text-sm text-muted-foreground">This project has no WBS yet.</p> : (
        <div className="max-h-[480px] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <tbody>
              {shown.map(({ n, level }) => (
                <tr key={n.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5" style={{ paddingLeft: 12 + (level - 1) * 16 }}>
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{n.wbs_outline_code ?? n.wbs_code}</span>{n.wbs_name}
                  </td>
                  <td className="w-64 px-3 py-1 text-right">
                    {canEditSchedule ? (
                      <span className="inline-flex items-center gap-1">
                        {saving === n.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        <select className={sel} value={n.responsible_id ?? ""} disabled={saving === n.id} onChange={(e) => void assign(n, e.target.value || null)}>
                          <option value="">— not assigned —</option>
                          {n.responsible_id && !names.has(n.responsible_id) && <option value={n.responsible_id}>(no longer a member)</option>}
                          {current.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                        </select>
                      </span>
                    ) : <span className="text-xs">{n.responsible_id ? names.get(n.responsible_id) ?? "(no longer a member)" : "—"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
