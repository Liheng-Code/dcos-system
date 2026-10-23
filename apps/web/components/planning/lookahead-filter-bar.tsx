"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Link2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  depth?: number;
  hint?: string;
}

const TRIGGER_CLASS =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted outline-none focus-visible:border-ring";

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <Popover>
      <PopoverTrigger className={cn(TRIGGER_CLASS, selected.length > 0 && "border-primary/50")}>
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-2 p-2">
        {searchable && options.length > 8 && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="h-8 text-xs"
          />
        )}
        <div className="max-h-64 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No options</p>
          ) : (
            visible.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  style={{ paddingLeft: 8 + (o.depth ?? 0) * 12 }}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(o.value)} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{o.hint}</span>
                  )}
                  {o.count !== undefined && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">{o.count}</span>
                  )}
                </label>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>
            Clear {label.toLowerCase()}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export interface LookaheadFilterBarProps {
  disciplineOptions: FilterOption[];
  zoneOptions: FilterOption[];
  statusOptions: FilterOption[];
  disciplines: string[];
  zones: string[];
  statuses: string[];
  onDisciplines: (v: string[]) => void;
  onZones: (v: string[]) => void;
  onStatuses: (v: string[]) => void;
  shown: number;
  total: number;
  /** Done activities in the window that are hidden because no status filter is set. */
  hiddenDone: number;
  hasActive: boolean;
  onClear: () => void;
  onCopyLink: () => void;
}

export function LookaheadFilterBar(p: LookaheadFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <MultiSelect label="Trade / Discipline" options={p.disciplineOptions} selected={p.disciplines} onChange={p.onDisciplines} searchable />
      <MultiSelect label="Zone / Location" options={p.zoneOptions} selected={p.zones} onChange={p.onZones} searchable />
      <MultiSelect label="Status" options={p.statusOptions} selected={p.statuses} onChange={p.onStatuses} />
      {p.hasActive && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={p.onClear}>
          <X className="mr-1 h-3.5 w-3.5" />
          Clear filters
        </Button>
      )}
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          Showing <strong className="text-foreground">{p.shown}</strong> of {p.total} activities
          {p.hiddenDone > 0 && <> · {p.hiddenDone} done hidden</>}
        </span>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={p.onCopyLink}>
          <Link2 className="mr-1 h-3.5 w-3.5" />
          Copy link
        </Button>
      </span>
    </div>
  );
}

