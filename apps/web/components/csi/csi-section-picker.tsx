"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CsiSection } from "@/lib/csi-divisions";

interface CsiSectionPickerProps {
  /** All sections to choose from (active ones are offered; the current value is always shown). */
  sections: CsiSection[];
  value: string | null;
  onChange: (code: string | null) => void;
  /** Limit the list to one division ("26"). */
  divisionCode?: string | null;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
}

/** Searchable CSI section select: shows "03 30 00 — Cast-in-Place Concrete". Shared by QS and Planning. */
export function CsiSectionPicker({
  sections, value, onChange, divisionCode, disabled, id, placeholder = "Select a CSI section…", className,
}: CsiSectionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Outside click and Escape close the list through the Popover; the search is reset whenever it closes.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const current = value ? sections.find((s) => s.code === value) ?? null : null;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => s.is_active || s.code === value)
      .filter((s) => !divisionCode || s.division_code === divisionCode)
      .filter((s) => !q || s.code.includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 200);
  }, [sections, divisionCode, query, value]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className={cn("flex h-8 w-full items-center rounded-lg border border-input bg-transparent text-sm", className)}>
        <PopoverTrigger
          id={id}
          type="button"
          disabled={disabled}
          className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 px-2.5 text-left disabled:opacity-50"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? `${value} — ${current?.name ?? ""}` : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        {value && !disabled && (
          <button type="button" aria-label="Clear CSI section" onClick={() => onChange(null)} className="mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* portalled, so a Dialog's overflow cannot clip it */}
      <PopoverContent align="start" className="z-[100] w-80 max-w-[90vw] p-1.5">
        <div>
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code or name…"
              className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-sm outline-hidden"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching sections.</p>
            ) : options.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => { onChange(s.code); handleOpenChange(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted",
                  s.code === value && "bg-muted font-medium",
                  s.level === 3 && "pl-5",
                )}
              >
                <span className="shrink-0 font-mono">{s.code}</span>
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
