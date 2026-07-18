"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Save, RotateCcw, Loader2, ChevronDown, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type SiteDataParams,
  type PrelimCaseSummary,
  DEFAULT_SITE_DATA,
  listCases,
  getCase,
  getDefaultCase,
  saveCase,
  createCase,
  deleteCase,
  renameCase,
} from "@/lib/prelim-library-service";

interface SiteDataPanelProps {
  params: SiteDataParams;
  onParamsChange: (params: SiteDataParams) => void;
  onRecalculate: () => void;
  onCaseChanged?: () => void;
}

const PARAM_ORDER: (keyof SiteDataParams)[] = [
  "P01", "P02", "P03", "P04", "P05", "P06",
  "P07", "P08", "P09", "P10", "P11", "P12",
];

const META: Record<string, { label: string; unit: string; derived?: string }> = {
  P01: { label: "Site perimeter (hoarding line)", unit: "m" },
  P02: { label: "Building footprint", unit: "m2" },
  P03: { label: "Building perimeter", unit: "m" },
  P04: { label: "Storeys above ground", unit: "no" },
  P05: { label: "Building height", unit: "m" },
  P06: { label: "Facade area", unit: "m2", derived: "P03 x P05" },
  P07: { label: "Programme duration", unit: "months" },
  P08: { label: "Structure phase duration", unit: "months" },
  P09: { label: "Scaffold rental duration", unit: "months" },
  P10: { label: "Peak workforce", unit: "no" },
  P11: { label: "Floors incl. roof (edge protection)", unit: "no" },
  P12: { label: "Gross floor area", unit: "m2", derived: "P02 x P04" },
};

export default function SiteDataPanel({ params, onParamsChange, onRecalculate, onCaseChanged }: SiteDataPanelProps) {
  const [local, setLocal] = useState<SiteDataParams>({ ...params });
  const [recalculating, setRecalculating] = useState(false);

  // Case state
  const [cases, setCases] = useState<PrelimCaseSummary[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string>("");
  const [activeCaseName, setActiveCaseName] = useState<string>("Default");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load cases on mount
  const loadCases = useCallback(async () => {
    try {
      const list = await listCases();
      setCases(list);
      if (activeCaseId) {
        return; // already loaded a case
      }
      // Load default case
      const def = await getDefaultCase();
      setActiveCaseId(def.id);
      setActiveCaseName(def.name);
      onParamsChange(def.params);
      setLocal(def.params);
      onRecalculate();
    } catch {
      // silent
    }
  }, [activeCaseId, onParamsChange, onRecalculate]);

  useEffect(() => { loadCases(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as HTMLElement)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Sync local state when params change externally (e.g. case switch)
  useEffect(() => {
    setLocal({ ...params });
  }, [params]);

  // ── Param edits ──────────────────────────────────────────────────────────────

  function handleChange(key: keyof SiteDataParams, value: string) {
    const num = parseFloat(value) || 0;
    const next = { ...local, [key]: num };
    if (key === "P03" || key === "P05") next.P06 = next.P03 * next.P05;
    if (key === "P02" || key === "P04") next.P12 = next.P02 * next.P04;
    setLocal(next);
  }

  async function handleApply() {
    setRecalculating(true);
    onParamsChange(local);
    onRecalculate();
    // auto-save to active case
    if (activeCaseId) {
      try { await saveCase(activeCaseId, local); } catch { /* silent */ }
    }
    setRecalculating(false);
  }

  function handleReset() {
    setLocal({ ...DEFAULT_SITE_DATA });
    onParamsChange({ ...DEFAULT_SITE_DATA });
    onRecalculate();
  }

  // ── Case switching ────────────────────────────────────────────────────────────

  async function handleSwitchCase(id: string) {
    const c = await getCase(id);
    setActiveCaseId(c.id);
    setActiveCaseName(c.name);
    setLocal(c.params);
    onParamsChange(c.params);
    onRecalculate();
    setDropdownOpen(false);
  }

  // ── Create new case ───────────────────────────────────────────────────────────

  async function handleCreateCase() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const c = await createCase(trimmed, local);
      setActiveCaseId(c.id);
      setActiveCaseName(c.name);
      setCases((prev) => [...prev, { id: c.id, name: c.name, is_default: c.is_default }]);
      setShowNewDialog(false);
      setNewName("");
    } catch { /* silent */ }
    setSaving(false);
  }

  // ── Rename ────────────────────────────────────────────────────────────────────

  async function handleRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    await renameCase(id, trimmed);
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
    if (id === activeCaseId) setActiveCaseName(trimmed);
    setRenamingId(null);
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm("Delete this case? This cannot be undone.")) return;
    await deleteCase(id);
    setCases((prev) => prev.filter((c) => c.id !== id));
    // if deleted the active one, switch to first remaining
    if (id === activeCaseId) {
      const remaining = cases.filter((c) => c.id !== id);
      if (remaining.length > 0) {
        await handleSwitchCase(remaining[0].id);
      } else {
        const def = await getDefaultCase();
        setActiveCaseId(def.id);
        setActiveCaseName(def.name);
        setLocal(def.params);
        onParamsChange(def.params);
        onRecalculate();
      }
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Top row: Case selector + title */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-sm font-semibold whitespace-nowrap">Site Data Parameters</h3>
            {/* Case dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted/50 transition-colors max-w-[500px]"
              >
                <span className="truncate">{activeCaseName}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-64 rounded-lg border border-border bg-background shadow-lg">
                  <div className="p-1 max-h-60 overflow-y-auto">
                    {cases.map((c) => (
                      <div key={c.id} className="flex items-center gap-1 group">
                        {renamingId === c.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(c.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            onBlur={() => handleRename(c.id)}
              className="flex-1 rounded border border-border px-2 py-1 text-sm"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSwitchCase(c.id)}
                            className={`flex-1 text-left rounded px-2 py-1.5 text-sm truncate transition-colors ${
                              c.id === activeCaseId ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-medium" : "hover:bg-muted/50"
                            }`}
                          >
                            {c.name}
                            {c.is_default && <span className="text-[10px] text-muted-foreground ml-1">(default)</span>}
                          </button>
                        )}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameValue(c.name); }}
                            className="p-1 rounded hover:bg-muted"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                          {!c.is_default && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                              className="p-1 rounded hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border p-1">
                    <button
                      type="button"
                      onClick={() => { setShowNewDialog(true); setDropdownOpen(false); setNewName(activeCaseName + " (Copy)"); }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Save as new case…
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="ghost" onClick={handleReset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
            <Button size="sm" onClick={handleApply} disabled={recalculating}>
              {recalculating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Apply &amp; Recalculate
            </Button>
          </div>
        </div>

        {/* New case dialog */}
        {showNewDialog && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
            <label className="text-xs text-muted-foreground shrink-0">New case name:</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateCase(); if (e.key === "Escape") setShowNewDialog(false); }}
              className="flex-1 rounded border border-border px-2 py-1 text-sm"
            />
            <Button size="sm" onClick={handleCreateCase} disabled={saving || !newName.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewDialog(false)}>
              Cancel
            </Button>
          </div>
        )}

        {/* Param grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PARAM_ORDER.map((key) => {
            const meta = META[key];
            const isDerived = !!meta.derived;
            return (
              <div key={key} className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="font-mono text-[10px] text-muted-foreground/70">{key}</span>
                  {meta.label}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={local[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={isDerived}
                    className={`w-full rounded-lg border border-border px-2.5 py-1.5 text-sm tabular-nums ${
                      isDerived ? "bg-muted/50 text-muted-foreground" : "bg-background"
                    }`}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">{meta.unit}</span>
                </div>
                {meta.derived && (
                  <p className="text-[10px] text-muted-foreground/60">= {meta.derived}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
