"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Send, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listPromotableTakeoff,
  resolveProjectPhase,
  listProjectTenders,
  listProjectBoqs,
  listBoqSections,
  listTenderBudgetCodes,
  searchTenderBoqItems,
  searchQsBoqItems,
  promoteTakeoffToBoq,
  unpromoteTakeoff,
  type PromotableTakeoffRow,
  type BoqTargetPhase,
  type TenderOption,
  type BoqItemOption,
} from "@/lib/design/bim/bim-boq-promotion-service";
import type { QsBoqSummary, QsBoqSection } from "@/lib/qs/public";
import type { BudgetCode } from "@/lib/qs/public-tender";

interface BimReviewPromoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  projectId: string;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

export function BimReviewPromoteDialog({ open, onOpenChange, modelId, projectId }: BimReviewPromoteDialogProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PromotableTakeoffRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [phase, setPhase] = useState<BoqTargetPhase | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [saving, setSaving] = useState(false);

  // Pre-contract target state
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [tenderId, setTenderId] = useState("");
  const [section, setSection] = useState("");
  const [budgetCodes, setBudgetCodes] = useState<BudgetCode[]>([]);
  const [budgetCodeId, setBudgetCodeId] = useState<string>("");

  // Post-contract target state
  const [boqs, setBoqs] = useState<QsBoqSummary[]>([]);
  const [boqId, setBoqId] = useState("");
  const [sections, setSections] = useState<QsBoqSection[]>([]);
  const [boqSectionId, setBoqSectionId] = useState("");

  // "New line" fields
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");

  // "Existing line" search
  const [existingSearch, setExistingSearch] = useState("");
  const [existingOptions, setExistingOptions] = useState<BoqItemOption[]>([]);
  const [existingBoqItemId, setExistingBoqItemId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [takeoffRows, resolvedPhase] = await Promise.all([
        listPromotableTakeoff(modelId),
        resolveProjectPhase(projectId),
      ]);
      setRows(takeoffRows);
      setPhase(resolvedPhase);
      setSelectedIds(new Set());
      if (resolvedPhase === "precontract") {
        const [t, bc] = await Promise.all([listProjectTenders(projectId), listTenderBudgetCodes()]);
        setTenders(t);
        setBudgetCodes(bc);
        if (t.length === 1) setTenderId(t[0].id);
      } else {
        const b = await listProjectBoqs(projectId);
        setBoqs(b);
        if (b.length === 1) setBoqId(b[0].id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load takeoff data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-open; load() batches its own setState calls
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelId, projectId]);

  useEffect(() => {
    const fetcher = phase === "postcontract" && boqId
      ? listBoqSections(projectId, boqId)
      : Promise.resolve([]);
    fetcher
      .then((s) => { setSections(s); setBoqSectionId(s.length === 1 ? s[0].id : ""); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load BOQ sections"));
  }, [phase, boqId, projectId]);

  useEffect(() => {
    if (mode !== "existing") return;
    const handle = setTimeout(() => {
      const run = async () => {
        try {
          if (phase === "precontract" && tenderId) {
            setExistingOptions(await searchTenderBoqItems(tenderId, existingSearch));
          } else if (phase === "postcontract" && boqSectionId) {
            setExistingOptions(await searchQsBoqItems(boqSectionId, existingSearch));
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Search failed");
        }
      };
      void run();
    }, 300);
    return () => clearTimeout(handle);
  }, [mode, phase, tenderId, boqSectionId, existingSearch]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.description, r.section, r.material_type, r.element_type, r.discipline, r.global_id]
        .some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id) && !r.promotion),
    [rows, selectedIds],
  );
  const selectedUnits = useMemo(() => new Set(selectedRows.map((r) => r.unit ?? "").filter(Boolean)), [selectedRows]);
  const totalQuantity = useMemo(() => selectedRows.reduce((s, r) => s + (r.quantity ?? 0), 0), [selectedRows]);

  // Suggests a description/unit from the row(s) just selected, once — the fields
  // stay fully user-editable afterward. Applied at selection time (not via an
  // effect watching selectedRows) so it only ever fires on an explicit user action.
  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
    if (checked) {
      const row = rows.find((r) => r.id === id);
      if (row) {
        setDescription((prev) => prev || row.description || "");
        setUnit((prev) => prev || row.unit || "");
      }
    }
  }

  async function handlePromote() {
    if (!phase || selectedRows.length === 0) return;
    if (selectedUnits.size > 1) {
      toast.error("Selected elements have mixed units — narrow the selection or pick one unit family at a time");
      return;
    }
    setSaving(true);
    try {
      const takeoffPayload = selectedRows.map((r) => ({ id: r.id, quantity: r.quantity ?? null }));
      if (mode === "new") {
        if (!description.trim() || !unit.trim()) { toast.error("Description and unit are required"); setSaving(false); return; }
        if (phase === "precontract") {
          if (!tenderId) { toast.error("Select a tender"); setSaving(false); return; }
          await promoteTakeoffToBoq(takeoffPayload, {
            type: "new", phase: "precontract",
            tenderId, section: section || "BIM Takeoff", budgetCodeId: budgetCodeId || null,
            description: description.trim(), unit: unit.trim(),
          });
        } else {
          if (!boqSectionId) { toast.error("Select a BOQ section"); setSaving(false); return; }
          await promoteTakeoffToBoq(takeoffPayload, {
            type: "new", phase: "postcontract",
            boqSectionId, projectId, description: description.trim(), unit: unit.trim(),
          });
        }
      } else {
        if (!existingBoqItemId) { toast.error("Pick an existing BOQ line to link to"); setSaving(false); return; }
        if (phase === "precontract") {
          await promoteTakeoffToBoq(takeoffPayload, { type: "existing", phase: "precontract", boqItemId: existingBoqItemId });
        } else {
          await promoteTakeoffToBoq(takeoffPayload, { type: "existing", phase: "postcontract", boqItemId: existingBoqItemId, boqSectionId });
        }
      }
      toast.success(`Promoted ${selectedRows.length} element${selectedRows.length !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setDescription("");
      setUnit("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to promote");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpromote(linkId: string) {
    try {
      await unpromoteTakeoff(linkId);
      toast.success("Unlinked");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unlink");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review &amp; Promote Takeoff</DialogTitle>
          <DialogDescription>
            Staged quantities extracted from this model. Select elements and promote them into a BOQ line
            {phase ? ` (target: ${phase === "precontract" ? "tender BOQ" : "cost-control BOQ"}, based on project phase)` : ""}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3 overflow-hidden">
            <div className="relative w-full max-w-xs shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by description, section, material…" className="pl-8" />
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Description</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No staged elements found. Use &quot;Extract for Takeoff&quot; on the model first.</TableCell></TableRow>
                  ) : (
                    filteredRows.map((r) => (
                      <TableRow key={r.id} className={r.promotion ? "opacity-60" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            disabled={!!r.promotion}
                            onCheckedChange={(c) => toggleRow(r.id, c === true)}
                          />
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm">{r.description || r.ifc_class || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.section || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.material_type || "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.quantity != null ? fmt(r.quantity) : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.unit || "—"}</TableCell>
                        <TableCell>
                          {r.promotion ? (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px]">Promoted</Badge>
                              <button onClick={() => handleUnpromote(r.promotion!.id)} className="text-muted-foreground hover:text-red-600" title="Unlink">
                                <Unlink className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Not promoted</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {selectedRows.length > 0 && (
              <div className="shrink-0 space-y-3 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium">
                    {selectedRows.length} element{selectedRows.length !== 1 ? "s" : ""} selected · total {fmt(totalQuantity)}
                    {selectedUnits.size === 1 ? ` ${[...selectedUnits][0]}` : selectedUnits.size > 1 ? " (mixed units)" : ""}
                  </p>
                  <div className="flex gap-1">
                    <Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>New line</Button>
                    <Button size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>Add to existing</Button>
                  </div>
                </div>

                {phase === "precontract" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Tender *</p>
                      <Select value={tenderId} onValueChange={(v) => v && setTenderId(v)}>
                        <SelectTrigger><SelectValue placeholder="Select tender…" /></SelectTrigger>
                        <SelectContent>
                          {tenders.map((t) => <SelectItem key={t.id} value={t.id}>{t.tender_no} — {t.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {mode === "new" && (
                      <>
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Section</p>
                          <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="BIM Takeoff" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Budget Code</p>
                          <Select value={budgetCodeId} onValueChange={(v) => v && setBudgetCodeId(v)}>
                            <SelectTrigger><SelectValue placeholder="Optional…" /></SelectTrigger>
                            <SelectContent>
                              {budgetCodes.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.description}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {phase === "postcontract" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium">BOQ *</p>
                      <Select value={boqId} onValueChange={(v) => v && setBoqId(v)}>
                        <SelectTrigger><SelectValue placeholder="Select BOQ…" /></SelectTrigger>
                        <SelectContent>
                          {boqs.map((b) => <SelectItem key={b.id} value={b.id}>{b.boq_number} — {b.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Section *</p>
                      <Select value={boqSectionId} onValueChange={(v) => v && setBoqSectionId(v)}>
                        <SelectTrigger><SelectValue placeholder="Select section…" /></SelectTrigger>
                        <SelectContent>
                          {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}{s.baseline_status === "locked" ? " (locked)" : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {mode === "new" ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <p className="text-xs font-medium">Description *</p>
                      <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Unit *</p>
                      <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m3" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Search existing line</p>
                    <Input value={existingSearch} onChange={(e) => setExistingSearch(e.target.value)} placeholder="Search by description…" />
                    <div className="max-h-32 space-y-1 overflow-y-auto">
                      {existingOptions.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => setExistingBoqItemId(o.id)}
                          className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${existingBoqItemId === o.id ? "bg-primary/15 text-primary" : "hover:bg-muted"}`}
                        >
                          {o.description} — {fmt(o.quantity)} {o.unit}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePromote} disabled={saving || selectedRows.length === 0}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Promote {selectedRows.length > 0 ? `(${selectedRows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
