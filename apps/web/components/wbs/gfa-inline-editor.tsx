"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getWbsNodeGfa, upsertWbsNodeGfa } from "@/lib/qs-service";

interface GfaInlineEditorProps {
  wbsNodeId: string;
  nodeType: string;
  gfaValue?: number | null;
  gfaSource?: string | null;
  onSaved?: (value: number, source: string) => void;
}

export function GfaInlineEditor({ wbsNodeId, nodeType, gfaValue, gfaSource, onSaved }: GfaInlineEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(gfaValue?.toString() ?? "");
  const [source, setSource] = useState(gfaSource ?? "");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function loadGfa() {
    if (gfaValue != null) return;
    setLoading(true);
    try {
      const gfa = await getWbsNodeGfa(wbsNodeId);
      if (gfa) {
        setValue(String(gfa.value));
        setSource(gfa.source ?? "");
      }
    } catch {
      // silent
    }
    setLoading(false);
  }

  function handleStartEdit() {
    loadGfa();
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setValue(gfaValue?.toString() ?? "");
    setSource(gfaSource ?? "");
  }

  async function handleSave() {
    const numericValue = parseFloat(value);
    if (Number.isNaN(numericValue) || numericValue < 0) {
      toast.error("Enter a valid GFA value (m²)");
      return;
    }
    if (!source.trim()) {
      toast.error("Drawing reference is required");
      return;
    }
    setSaving(true);
    try {
      await upsertWbsNodeGfa({
        wbsNodeId,
        value: numericValue,
        source: source.trim(),
      });
      toast.success("GFA saved");
      setEditing(false);
      onSaved?.(numericValue, source.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save GFA");
    }
    setSaving(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  function formatGfa(val: number | null | undefined): string {
    if (val == null) return "—";
    return val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  if (nodeType !== "level") return null;

  if (editing) {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="GFA m²"
          className="w-20 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[11px] font-mono outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Drawing ref"
          className="w-24 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[10px] outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          disabled={saving}
          className="p-0.5 rounded text-emerald-600 hover:bg-emerald-50"
          title="Save"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleCancel(); }}
          className="p-0.5 rounded text-muted-foreground hover:bg-muted"
          title="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 group/gfa cursor-pointer",
        gfaValue != null ? "text-blue-600" : "text-muted-foreground hover:text-blue-500",
      )}
      onClick={(e) => { e.stopPropagation(); handleStartEdit(); }}
      title={gfaSource ? `Source: ${gfaSource}` : "Click to enter GFA"}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <>
          <span className="font-mono text-[11px] tabular-nums">
            {formatGfa(gfaValue)}
          </span>
          <span className="text-[9px] text-muted-foreground">m²</span>
          <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/gfa:opacity-100 transition-opacity" />
        </>
      )}
    </div>
  );
}
