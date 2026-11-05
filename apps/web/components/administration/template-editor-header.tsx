"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Copy, Info, Loader2, MoreHorizontal, Save, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** A summary chip in the header: short text, optional tone and hover text. */
export interface HeaderChip { key: string; label: ReactNode; title?: string; tone?: "default" | "good" | "warn" }

const CHIP_CLS: Record<NonNullable<HeaderChip["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

/**
 * Compact header of a Master Libraries template editor (WBS, level...): the name edited in place, version and
 * Active toggle, one line of summary chips, Settings / more / Save actions, and the template's settings in a
 * drawer that is closed by default (open for a new template, so its fields can be filled in).
 */
export function TemplateEditorHeader({
  name, onNameChange, namePlaceholder, version, isNew, active, onActiveChange, activeHint, chips, settings,
  onDuplicate, onDelete, onSave, saving, canSave, note,
}: {
  name: string;
  onNameChange: (name: string) => void;
  namePlaceholder: string;
  version?: number | null;
  isNew: boolean;
  active: boolean;
  onActiveChange: (active: boolean) => void;
  /** What "Active" means for this template, shown on hover. */
  activeHint: string;
  chips: HeaderChip[];
  settings: ReactNode;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
  /** How saving affects projects, shown on hover next to Save. */
  note: string;
}) {
  const [open, setOpen] = useState(isNew);
  const missingName = !name.trim();
  // only warnings stay in the header; the full summary is at the top of the Settings drawer
  const warnings = chips.filter((c) => c.tone === "warn");
  const chip = (c: HeaderChip) => (
    <span key={c.key} title={c.title} className={cn("rounded-full px-2 py-0.5 text-[11px]", CHIP_CLS[c.tone ?? "default"])}>{c.label}</span>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={namePlaceholder} aria-label="Template name"
              className={cn("min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-lg font-semibold outline-hidden",
                "hover:border-border focus:border-primary", missingName && "border-destructive/50")}
            />
            {version != null && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">v{version}</span>}
            <button
              type="button" onClick={() => onActiveChange(!active)} title={activeHint} aria-pressed={active}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                active ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/50")} />
              {active ? "Active" : "Inactive"}
            </button>
          </div>
          {warnings.length > 0 && <div className="flex flex-wrap items-center gap-1.5 px-1.5">{warnings.map(chip)}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant={open ? "secondary" : "outline"} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Settings
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </Button>
          {(onDuplicate || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onDuplicate && <DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>}
                {onDelete && <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="text-muted-foreground" title={note}><Info className="h-3.5 w-3.5" /></span>
          <Button size="sm" onClick={onSave} disabled={saving || !canSave}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
          </Button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          {chips.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{chips.map(chip)}</div>}
          {settings}
        </div>
      )}
    </div>
  );
}
