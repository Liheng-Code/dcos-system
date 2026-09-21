"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronDown, ChevronRight, Check, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  listCases,
  getCalculatedItemsForCase,
} from "@/lib/prelim-library-service";
import { toast } from "sonner";
import type { PrelimCaseSummary, CalculatedPrelimItem, CalculatedPrelimTree } from "@/lib/prelim-library-service";

interface LoadLibraryDialogProps {
  tenderId: string;
  onClose: () => void;
  onLoaded: () => void;
}

type Step = "select_case" | "select_items";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getAllDescendantCodes(item: CalculatedPrelimItem): string[] {
  const codes: string[] = [item.code];
  for (const child of item.children) {
    codes.push(...getAllDescendantCodes(child));
  }
  return codes;
}

function getCheckState(item: CalculatedPrelimItem, selectedCodes: Set<string>): "checked" | "indeterminate" | "unchecked" {
  if (!selectedCodes.has(item.code)) return "unchecked";
  for (const child of item.children) {
    if (getCheckState(child, selectedCodes) !== "checked") return "indeterminate";
  }
  return "checked";
}

function countSelectedItems(sections: CalculatedPrelimItem[], selectedCodes: Set<string>): number {
  let count = 0;
  function walk(item: CalculatedPrelimItem) {
    if (selectedCodes.has(item.code)) count++;
    for (const child of item.children) walk(child);
  }
  for (const section of sections) walk(section);
  return count;
}

function totalSelectedAmount(items: CalculatedPrelimItem[], selectedCodes: Set<string>): number {
  let total = 0;
  function walk(item: CalculatedPrelimItem) {
    if (selectedCodes.has(item.code)) total += item.amount;
    for (const child of item.children) walk(child);
  }
  for (const item of items) walk(item);
  return total;
}

export default function LoadLibraryDialog({ tenderId, onClose, onLoaded }: LoadLibraryDialogProps) {
  const [step, setStep] = useState<Step>("select_case");
  const [caseList, setCaseList] = useState<PrelimCaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [selectedCaseName, setSelectedCaseName] = useState("");
  const [tree, setTree] = useState<CalculatedPrelimTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCases()
      .then((list) => {
        setCaseList(list);
        if (list.length > 0 && !selectedCaseId) {
          setSelectedCaseId(list[0].id);
          setSelectedCaseName(list[0].name);
        }
      })
      .catch(() => toast.error("Failed to load templates"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectCase() {
    if (!selectedCaseId) return;
    setLoading(true);
    setSelectedCodes(new Set());
    try {
      const calculatedTree = await getCalculatedItemsForCase(selectedCaseId);
      setTree(calculatedTree);
      const topCodes = new Set(calculatedTree.sections.map((s) => s.code));
      setExpandedCodes(topCodes);
      setStep("select_items");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load template");
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(item: CalculatedPrelimItem, checked: boolean) {
    const codes = getAllDescendantCodes(item);
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      for (const code of codes) {
        if (checked) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  async function handleAccept() {
    if (!tree || selectedCodes.size === 0) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const rows: Array<{
        tender_id: string;
        code: string;
        description: string;
        unit: string;
        quantity: number;
        rate: number;
        sort_order: number;
        notes: string | null;
      }> = [];

      function collect(item: CalculatedPrelimItem) {
        if (!selectedCodes.has(item.code)) return;
        rows.push({
          tender_id: tenderId,
          code: item.code,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          rate: item.rate,
          sort_order: item.sort_order,
          notes: null,
        });
        for (const child of item.children) collect(child);
      }

      for (const section of tree.sections) collect(section);

      // tender_preliminaries_items has no unique (tender_id, code), so loading the same case twice
      // would silently duplicate every line. Only add codes this tender does not already have.
      const { data: existing, error: existingError } = await supabase
        .from("tender_preliminaries_items")
        .select("code")
        .eq("tender_id", tenderId);
      if (existingError) throw new Error(existingError.message);
      const existingCodes = new Set((existing ?? []).map((r) => r.code));
      const newRows = rows.filter((r) => !existingCodes.has(r.code));
      const skipped = rows.length - newRows.length;

      if (newRows.length > 0) {
        const { error } = await supabase.from("tender_preliminaries_items").insert(newRows);
        if (error) throw new Error(error.message);
      }
      toast.success(
        skipped > 0
          ? `${newRows.length} item(s) loaded from library, ${skipped} already on this tender skipped`
          : `${newRows.length} item(s) loaded from library`,
      );
      onLoaded();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load items");
    } finally {
      setSaving(false);
    }
  }

  function renderNode(item: CalculatedPrelimItem, depth: number) {
    const state = getCheckState(item, selectedCodes);
    const checked = state === "checked";
    const indeterminate = state === "indeterminate";
    const expanded = expandedCodes.has(item.code);
    const hasChildren = item.children.length > 0;

    return (
      <div key={item.code}>
        <div
          className="flex items-center gap-3 py-1 px-1 rounded hover:bg-muted/30 cursor-pointer text-sm select-none"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => toggleItem(item, !selectedCodes.has(item.code))}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!hasChildren) return;
              setExpandedCodes((prev) => {
                const next = new Set(prev);
                if (next.has(item.code)) next.delete(item.code);
                else next.add(item.code);
                return next;
              });
            }}
            className="p-0.5 rounded hover:bg-muted shrink-0"
          >
            {hasChildren ? (
              expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <span className="w-3.5 inline-block" />
            )}
          </button>

          <span className="p-0.5 shrink-0">
            {indeterminate ? (
              <Minus className="h-4 w-4 text-primary" />
            ) : checked ? (
              <Check className="h-4 w-4 text-primary bg-primary/10 rounded-sm" />
            ) : (
              <span className="h-4 w-4 border border-input rounded-[4px] block" />
            )}
          </span>

          <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{item.code}</span>
          <span className="flex-1 min-w-0">{item.description}</span>
          <span className="text-xs text-muted-foreground w-12 text-right shrink-0">{item.unit}</span>
          <span className="text-xs tabular-nums w-20 text-right shrink-0">{fmt(item.quantity)}</span>
          <span className="text-xs tabular-nums w-24 text-right shrink-0 text-muted-foreground">${fmt(item.rate)}</span>
          <span className="text-xs tabular-nums font-medium w-24 text-right shrink-0">${fmt(item.amount)}</span>
        </div>
        {hasChildren && expanded && (
          <div>{item.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-6xl rounded-lg border bg-background shadow-lg max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-base font-semibold">
            {step === "select_case" ? "Load from Library" : `Load from Library — ${selectedCaseName}`}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "select_case" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Choose a saved Site Data template to load preliminaries from.</p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Template</label>
                <select
                  value={selectedCaseId}
                  onChange={(e) => {
                    const c = caseList.find((c) => c.id === e.target.value);
                    setSelectedCaseId(e.target.value);
                    setSelectedCaseName(c?.name ?? "");
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a template…</option>
                  {caseList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.is_default ? " (default)" : ""}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === "select_items" && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tree ? (
                <>
                  <div className="flex items-center gap-3 px-1 pb-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider"
                    style={{ paddingLeft: "28px" }}
                  >
                    <span className="w-3.5 shrink-0" />
                    <span className="w-4 shrink-0" />
                    <span className="w-24 shrink-0">Code</span>
                    <span className="flex-1">Description</span>
                    <span className="w-12 text-right shrink-0">Unit</span>
                    <span className="w-20 text-right shrink-0">Qty</span>
                    <span className="w-24 text-right shrink-0">Rate</span>
                    <span className="w-24 text-right shrink-0">Amount</span>
                  </div>
                  {tree.sections.map((section) => renderNode(section, 0))}
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-12 text-center">No items found for this template.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3">
          <div className="text-xs text-muted-foreground">
            {step === "select_items" && tree ? (
              <>
                <span className="font-medium">{countSelectedItems(tree.sections, selectedCodes)}</span> item(s) selected —
                <span className="font-medium ml-1">${fmt(totalSelectedAmount(tree.sections, selectedCodes))}</span>
              </>
            ) : (
              <span>{caseList.length} template(s) available</span>
            )}
          </div>
          <div className="flex gap-2">
            {step === "select_items" && (
              <Button size="sm" variant="ghost" onClick={() => { setStep("select_case"); setTree(null); }}>
                Back
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            {step === "select_case" ? (
              <Button size="sm" onClick={handleSelectCase} disabled={!selectedCaseId || loading}>
                {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={handleAccept} disabled={selectedCodes.size === 0 || saving}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Accept to Tender
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
