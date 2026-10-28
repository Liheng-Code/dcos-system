"use client";

import { useState } from "react";
import { Eye, EyeOff, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CadLayerInfo } from "@/lib/qs/qto/cad/cad-geometry";

/** CAD layers: show / hide each layer (view and snapping only), isolate one, show all. */
export function CadLayersButton({ layers, hidden, onChange }: { layers: CadLayerInfo[]; hidden: Set<string>; onChange: (next: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const used = layers.filter((l) => l.count > 0);
  const toggle = (name: string) => {
    const next = new Set(hidden);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange(next);
  };
  return (
    <div className="relative">
      <Button variant="ghost" size="sm" className={cn("h-7 gap-1 px-2 text-xs", hidden.size > 0 && "text-primary")} aria-expanded={open}
        title="Layers: show or hide CAD layers" onClick={() => setOpen((o) => !o)}>
        <Layers className="h-3.5 w-3.5" /> Layers{hidden.size > 0 ? ` (${used.length - hidden.size}/${used.length})` : ""}
      </Button>
      {open && (
        <div role="dialog" aria-label="Layers" className="absolute right-0 top-8 z-40 w-72 rounded-md border border-border bg-background p-2 text-xs shadow-lg">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="font-semibold">Layers ({used.length})</span>
            <button type="button" className="text-primary hover:underline" onClick={() => onChange(new Set())}>Show all</button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {used.map((l) => {
              const off = hidden.has(l.name);
              return (
                <li key={l.name} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
                  <button type="button" aria-pressed={!off} aria-label={`${off ? "Show" : "Hide"} ${l.name}`} onClick={() => toggle(l.name)}
                    className="text-muted-foreground hover:text-foreground">
                    {off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-border" style={{ background: l.color === "ink" ? "currentColor" : l.color }} />
                  <span className={cn("min-w-0 flex-1 truncate", off && "text-muted-foreground line-through")} title={l.name}>{l.name}</span>
                  <span className="tabular-nums text-muted-foreground">{l.count}</span>
                  <button type="button" className="hidden text-primary hover:underline group-hover:inline" title={`Show only ${l.name}`}
                    onClick={() => onChange(new Set(used.filter((x) => x.name !== l.name).map((x) => x.name)))}>Only</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
