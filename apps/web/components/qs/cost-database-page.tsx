"use client";

// QS → Cost & Estimation → Cost Database: saved Tender BOQ versions — review, export, and
// assign back (whole version or ticked lines) into a tender's BOQ.

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, ClipboardList, Database, FileSpreadsheet, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";
import { STAGE_LABELS, type TenderStage } from "@/lib/qs/tender-lifecycle";
import {
  deleteCostDatabase,
  getCostDatabaseItems,
  listCostDatabases,
  type CostDatabase,
  type CostDatabaseItem,
} from "@/lib/qs/tender-cost-database";
import { AssignCostDatabaseDialog } from "@/components/tenders/cost-estimation/assign-cost-database-dialog";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stageLabel = (s: string | null) => (s ? STAGE_LABELS[s as TenderStage] ?? s : "—");

type Version = CostDatabase & { created_by_name: string | null };

export default function CostDatabasePage() {
  const { can, loaded: permsLoaded } = useQsPermissions();
  const { can: canTender } = useTenderPermissions();

  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [items, setItems] = useState<CostDatabaseItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [lineSearch, setLineSearch] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadVersions = useCallback(async () => {
    try {
      const list = await listCostDatabases();
      setVersions(list);
      setSelectedId((prev) => (prev && list.some((v) => v.id === prev) ? prev : list[0]?.id ?? null));
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load the Cost Database");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadVersions(); }, [loadVersions]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingItems(true);
    setTicked(new Set());
    setLineSearch("");
    getCostDatabaseItems(selectedId)
      .then((rows) => !cancelled && setItems(rows))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load lines"))
      .finally(() => !cancelled && setLoadingItems(false));
    return () => { cancelled = true; };
  }, [selectedId]);

  const projects = useMemo(
    () => [...new Map(versions.filter((v) => v.project_code).map((v) => [v.project_code!, v.project_name])).entries()].sort(),
    [versions]
  );
  const filtered = useMemo(() => {
    let rows = versions;
    if (projectFilter !== "all") rows = rows.filter((v) => v.project_code === projectFilter);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((v) => [v.name, v.project_code, v.project_name, v.tender_no, v.notes].some((f) => f?.toLowerCase().includes(q)));
    return rows;
  }, [versions, projectFilter, search]);

  const current = versions.find((v) => v.id === selectedId) ?? null;

  const visibleLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => [r.item_code, r.description, r.section, r.sub_section, r.budget_code].some((f) => f?.toLowerCase().includes(q)));
  }, [items, lineSearch]);

  // Grouped by section, keeping the saved order.
  const sections = useMemo(() => {
    const map = new Map<string, CostDatabaseItem[]>();
    for (const r of visibleLines) map.set(r.section, [...(map.get(r.section) ?? []), r]);
    return [...map.entries()];
  }, [visibleLines]);

  const allTicked = visibleLines.length > 0 && visibleLines.every((r) => ticked.has(r.id));
  function toggleAll() {
    setTicked((prev) => {
      const next = new Set(prev);
      for (const r of visibleLines) {
        if (allTicked) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  }
  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportExcel() {
    if (!current) return;
    const data = items.map((r) => ({
      Code: r.item_code,
      Section: r.section,
      "Sub Section": r.sub_section ?? "",
      Description: r.description,
      Unit: r.unit,
      Qty: Number(r.quantity),
      "Labor Net": Number(r.labor_net_cost ?? 0),
      "Labor Margin %": Number(r.labor_margin_pct ?? 0),
      "Material Net": Number(r.material_net_cost ?? 0),
      "Material Margin %": Number(r.material_margin_pct ?? 0),
      Rate: Number(r.unit_rate),
      Amount: Number(r.total_amount ?? 0),
      "Budget Code": r.budget_code ?? "",
      Level: r.level,
      Building: r.building_code,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: k === "Description" ? 50 : Math.max(k.length, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    XLSX.writeFile(wb, `${current.name.replace(/[^\w.-]+/g, "_")}.xlsx`);
  }

  async function handleDelete() {
    if (!current || !window.confirm(`Delete "${current.name}" from the Cost Database? Lines already copied into tenders are kept.`)) return;
    setDeleting(true);
    try {
      await deleteCostDatabase(current.id);
      toast.success("Version deleted");
      setSelectedId(null);
      await loadVersions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  const canView = !permsLoaded || can("qs_cost_database", "view");
  const canDelete = can("qs_cost_database", "delete");
  const canAssign = canTender("tender_boq", "can_create");

  if (permsLoaded && !canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">You do not have permission to view the Cost Database.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Database className="h-5 w-5 text-muted-foreground" /> Cost Database
            <Badge variant="secondary">{versions.length}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Saved Tender BOQs. Save one from Cost Estimation → Tender BOQ → Save to Cost Database; reuse it here or from the Tender BOQ.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Saved versions */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search saved BOQs..." className="pl-8" />
          </div>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
            <option value="all">All projects ({versions.length})</option>
            {projects.map(([code, name]) => <option key={code} value={code}>{code}{name ? ` — ${name}` : ""}</option>)}
          </select>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : errorMsg ? (
            <p className="rounded-lg border border-dashed border-destructive/30 p-6 text-center text-xs text-muted-foreground">{errorMsg}</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
              <Database className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                {versions.length === 0 ? "Nothing saved yet — open a Tender BOQ and click Save to Cost Database." : "No saved BOQs match."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
              {filtered.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    v.id === selectedId ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                  )}
                >
                  <p className="line-clamp-1 text-sm font-medium">{v.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{v.project_code ?? "—"}{v.project_name ? ` · ${v.project_name}` : ""}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{v.item_count} lines · {v.created_at.slice(0, 10)}</span>
                    <span className="font-mono font-medium">{fmt(Number(v.total_amount))}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected version */}
        <div className="min-w-0">
          {!current ? (
            <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Select a saved BOQ to review it.
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{current.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {current.project_code ?? "—"}{current.project_name ? ` — ${current.project_name}` : ""} · Tender {current.tender_no ?? "—"} ·
                    Stage when saved: {stageLabel(current.tender_stage)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Saved {new Date(current.created_at).toLocaleString()}{current.created_by_name ? ` by ${current.created_by_name}` : ""}
                  </p>
                  {current.notes && <p className="mt-1 whitespace-pre-line text-sm">{current.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canAssign && (
                    <Button size="sm" onClick={() => setAssignOpen(true)} disabled={items.length === 0}>
                      <ClipboardList className="mr-1 h-4 w-4" />
                      {ticked.size > 0 ? `Assign ${ticked.size} Selected to Tender BOQ` : "Assign All to Tender BOQ"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={exportExcel} disabled={items.length === 0}>
                    <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
                  </Button>
                  {canDelete && (
                    <Button size="sm" variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive">
                      {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Delete
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-md bg-muted/40 px-3 py-2"><p className="text-xs text-muted-foreground">Lines</p><p className="font-mono font-medium">{current.item_count}</p></div>
                <div className="rounded-md bg-muted/40 px-3 py-2"><p className="text-xs text-muted-foreground">Sections</p><p className="font-mono font-medium">{new Set(items.map((i) => i.section)).size}</p></div>
                <div className="rounded-md bg-muted/40 px-3 py-2"><p className="text-xs text-muted-foreground">Total</p><p className="font-mono font-medium">{fmt(Number(current.total_amount))}</p></div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={lineSearch} onChange={(e) => setLineSearch(e.target.value)} placeholder="Search lines..." className="pl-8" />
                </div>
                {ticked.size > 0 && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setTicked(new Set())}>
                    Clear selection ({ticked.size})
                  </button>
                )}
              </div>

              <div className="overflow-auto rounded-lg border border-border" style={{ maxHeight: "60vh" }}>
                {loadingItems ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="sticky top-0 z-10 whitespace-nowrap bg-muted text-xs text-muted-foreground">
                      <tr className="text-left">
                        <th className="w-8 px-2 py-2">
                          <Checkbox checked={allTicked} onCheckedChange={toggleAll} aria-label="Select all lines" disabled={visibleLines.length === 0} />
                        </th>
                        <th className="px-2 py-2">Code</th>
                        <th className="px-2 py-2">Description</th>
                        <th className="px-2 py-2">Unit</th>
                        <th className="px-2 py-2 text-right">Qty</th>
                        <th className="px-2 py-2 text-right">Labor Net</th>
                        <th className="px-2 py-2 text-right">Material Net</th>
                        <th className="px-2 py-2 text-right">Rate</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                        <th className="px-2 py-2">Budget Code</th>
                        <th className="px-2 py-2">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.map(([section, rows]) => (
                        <SectionRows key={section} section={section} rows={rows} ticked={ticked} onToggle={toggle} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {current && (
        <AssignCostDatabaseDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          databaseId={current.id}
          preselectedItemIds={ticked.size > 0 ? [...ticked] : undefined}
          onAssigned={() => setTicked(new Set())}
        />
      )}
    </div>
  );
}

function SectionRows({ section, rows, ticked, onToggle }: {
  section: string; rows: CostDatabaseItem[]; ticked: Set<string>; onToggle: (id: string) => void;
}) {
  const subtotal = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  return (
    <>
      <tr className="border-t border-border bg-muted/30">
        <td />
        <td colSpan={7} className="px-2 py-1.5 text-xs font-semibold">{section}</td>
        <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">{fmt(subtotal)}</td>
        <td colSpan={2} />
      </tr>
      {rows.map((r) => (
        <tr key={r.id} className="whitespace-nowrap border-t border-border">
          <td className="px-2 py-1.5"><Checkbox checked={ticked.has(r.id)} onCheckedChange={() => onToggle(r.id)} aria-label={`Select ${r.item_code}`} /></td>
          <td className="px-2 py-1.5 font-mono text-xs">{r.item_code}</td>
          <td className="w-full max-w-0 px-2 py-1.5"><span className="block truncate" title={r.description}>{r.description}</span></td>
          <td className="px-2 py-1.5">{r.unit}</td>
          <td className="px-2 py-1.5 text-right font-mono">{fmt(Number(r.quantity))}</td>
          <td className="px-2 py-1.5 text-right font-mono">{r.labor_net_cost != null ? fmt(Number(r.labor_net_cost)) : "—"}</td>
          <td className="px-2 py-1.5 text-right font-mono">{r.material_net_cost != null ? fmt(Number(r.material_net_cost)) : "—"}</td>
          <td className="px-2 py-1.5 text-right font-mono">{fmt(Number(r.unit_rate))}</td>
          <td className="px-2 py-1.5 text-right font-mono">{fmt(Number(r.total_amount ?? 0))}</td>
          <td className="px-2 py-1.5 text-xs">{r.budget_code ?? "—"}</td>
          <td className="px-2 py-1.5 text-xs">{r.level}</td>
        </tr>
      ))}
    </>
  );
}
