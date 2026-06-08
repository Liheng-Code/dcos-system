"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ChevronDown, ChevronRight, Trash2, CheckCircle2, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type Itp,
  type ItpItem,
  getItps,
  createItp,
  updateItpStatus,
  getItpItems,
  createItpItem,
  deleteItpItem,
} from "@/lib/qaqc-service";

const TYPE_COLORS = {
  hold:    "bg-red-100 text-red-700",
  witness: "bg-amber-100 text-amber-700",
  review:  "bg-blue-100 text-blue-700",
};

const STATUS_COLORS: Record<Itp["status"], string> = {
  draft:  "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-500",
};

interface Props {
  projectId: string;
}

export function ItpManager({ projectId }: Props) {
  const [itps, setItps] = useState<Itp[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, ItpItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // New ITP form
  const [form, setForm] = useState({ title: "", discipline: "", description: "" });
  const [saving, setSaving] = useState(false);

  // New item form (per ITP)
  const [itemForm, setItemForm] = useState<Record<string, {
    activity: string; inspection_type: "hold" | "witness" | "review";
    responsible_party: string; acceptance_criteria: string; document_reference: string;
  }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setItps(await getItps(projectId)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function loadItems(itpId: string) {
    if (itemsMap[itpId]) return;
    setLoadingItems(itpId);
    try { setItemsMap((prev) => ({ ...prev, [itpId]: [] })); }
    finally { /* placeholder so state is set */ }
    try {
      const items = await getItpItems(itpId);
      setItemsMap((prev) => ({ ...prev, [itpId]: items }));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoadingItems(null); }
  }

  async function handleToggle(itpId: string) {
    if (expandedId === itpId) { setExpandedId(null); return; }
    setExpandedId(itpId);
    await loadItems(itpId);
  }

  async function handleCreateItp() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await createItp({ project_id: projectId, title: form.title.trim(), discipline: form.discipline || null, description: form.description || null });
      setForm({ title: "", discipline: "", description: "" });
      setShowCreate(false);
      await load();
      toast.success("ITP created");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleStatusToggle(itp: Itp) {
    const next = itp.status === "draft" ? "active" : itp.status === "active" ? "closed" : "active";
    try {
      await updateItpStatus(itp.id, next);
      setItps((prev) => prev.map((i) => i.id === itp.id ? { ...i, status: next } : i));
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleAddItem(itpId: string) {
    const f = itemForm[itpId];
    if (!f?.activity?.trim()) return;
    const nextSeq = (itemsMap[itpId]?.length ?? 0) + 1;
    try {
      const item = await createItpItem({
        itp_id: itpId,
        seq: nextSeq,
        activity: f.activity.trim(),
        inspection_type: f.inspection_type ?? "review",
        responsible_party: f.responsible_party || null,
        acceptance_criteria: f.acceptance_criteria || null,
        document_reference: f.document_reference || null,
      });
      setItemsMap((prev) => ({ ...prev, [itpId]: [...(prev[itpId] ?? []), item] }));
      setItemForm((prev) => ({ ...prev, [itpId]: { activity: "", inspection_type: "review", responsible_party: "", acceptance_criteria: "", document_reference: "" } }));
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleDeleteItem(itpId: string, itemId: string) {
    try {
      await deleteItpItem(itemId);
      setItemsMap((prev) => ({ ...prev, [itpId]: (prev[itpId] ?? []).filter((i) => i.id !== itemId) }));
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{itps.length} inspection and test plan{itps.length !== 1 ? "s" : ""}</div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New ITP
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="text-sm font-semibold">New Inspection & Test Plan</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Structural Steel Inspection"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Discipline</label>
              <input
                value={form.discipline}
                onChange={(e) => setForm((p) => ({ ...p, discipline: e.target.value }))}
                placeholder="e.g. Structural"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreateItp} disabled={saving || !form.title.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ITP list */}
      {itps.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
          No ITPs yet. Create your first Inspection & Test Plan.
        </div>
      )}

      {itps.map((itp) => {
        const expanded = expandedId === itp.id;
        const items = itemsMap[itp.id] ?? [];
        const f = itemForm[itp.id] ?? { activity: "", inspection_type: "review" as const, responsible_party: "", acceptance_criteria: "", document_reference: "" };

        return (
          <div key={itp.id} className="rounded-xl border border-slate-200 overflow-hidden">
            {/* ITP header */}
            <div
              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"
              onClick={() => handleToggle(itp.id)}
            >
              {expanded
                ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              }
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{itp.title}</div>
                {itp.discipline && (
                  <div className="text-[10px] text-slate-500">{itp.discipline}</div>
                )}
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLORS[itp.status])}>
                {itp.status}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleStatusToggle(itp); }}
                title={itp.status === "draft" ? "Activate" : itp.status === "active" ? "Close" : "Re-activate"}
                className="rounded p-1 hover:bg-slate-100"
              >
                {itp.status === "closed"
                  ? <Archive className="h-4 w-4 text-slate-400" />
                  : <CheckCircle2 className="h-4 w-4 text-slate-400" />
                }
              </button>
            </div>

            {/* ITP items */}
            {expanded && (
              <div className="border-t border-slate-100">
                {loadingItems === itp.id ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>
                ) : (
                  <>
                    {items.length > 0 && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                            <th className="px-3 py-2 text-left w-6">#</th>
                            <th className="px-3 py-2 text-left">Activity</th>
                            <th className="px-3 py-2 text-center w-24">Type</th>
                            <th className="px-3 py-2 text-left">Responsible</th>
                            <th className="px-3 py-2 text-left">Criteria</th>
                            <th className="px-3 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                              <td className="px-3 py-2 text-slate-400">{item.seq}</td>
                              <td className="px-3 py-2 font-medium">{item.activity}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", TYPE_COLORS[item.inspection_type])}>
                                  {item.inspection_type}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-500">{item.responsible_party ?? "—"}</td>
                              <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{item.acceptance_criteria ?? "—"}</td>
                              <td className="px-3 py-2">
                                <button onClick={() => handleDeleteItem(itp.id, item.id)} className="rounded p-1 hover:bg-red-50">
                                  <Trash2 className="h-3.5 w-3.5 text-slate-300 hover:text-red-500" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* Add item form */}
                    <div className="bg-slate-50 p-3 space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Add Checklist Item</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <input
                            value={f.activity}
                            onChange={(e) => setItemForm((p) => ({ ...p, [itp.id]: { ...f, activity: e.target.value } }))}
                            placeholder="Activity description *"
                            className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <select
                            value={f.inspection_type}
                            onChange={(e) => setItemForm((p) => ({ ...p, [itp.id]: { ...f, inspection_type: e.target.value as "hold" | "witness" | "review" } }))}
                            className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                          >
                            <option value="hold">Hold Point</option>
                            <option value="witness">Witness Point</option>
                            <option value="review">Review Point</option>
                          </select>
                        </div>
                        <div>
                          <input
                            value={f.responsible_party}
                            onChange={(e) => setItemForm((p) => ({ ...p, [itp.id]: { ...f, responsible_party: e.target.value } }))}
                            placeholder="Responsible party"
                            className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <input
                            value={f.acceptance_criteria}
                            onChange={(e) => setItemForm((p) => ({ ...p, [itp.id]: { ...f, acceptance_criteria: e.target.value } }))}
                            placeholder="Acceptance criteria"
                            className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <input
                            value={f.document_reference}
                            onChange={(e) => setItemForm((p) => ({ ...p, [itp.id]: { ...f, document_reference: e.target.value } }))}
                            placeholder="Doc reference"
                            className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={!f.activity?.trim()}
                        onClick={() => handleAddItem(itp.id)}
                      >
                        <Plus className="h-3 w-3" />
                        Add Item
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex gap-4 pt-1 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-red-300" />Hold Point — work stops until inspector approves</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-300" />Witness Point — inspector notified, work may continue if no-show</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-blue-300" />Review Point — documentation review only</span>
      </div>
    </div>
  );
}
