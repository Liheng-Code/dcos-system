"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { searchPalette } from "@/lib/project/projects/command-search";

// Ctrl+K (⌘K on a Mac): jump to any project, or straight to one of its tabs ("004 boq").
export function CommandPalette() {
  const router = useRouter();
  const { projects } = useProject();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)); // eslint-disable-line react-hooks/set-state-in-effect -- read once after mount (no navigator during SSR)
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => searchPalette(query, projects), [query, projects]);

  function openChange(next: boolean) {
    setOpen(next);
    if (next) { setQuery(""); setActive(0); }
  }

  function go(index: number) {
    const r = results[index];
    if (!r) return;
    setOpen(false);
    router.push(r.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); go(active); }
  }

  const shortcut = isMac ? "⌘K" : "Ctrl K";

  return (
    <>
      <button
        type="button"
        onClick={() => openChange(true)}
        className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:flex"
        aria-label="Jump to a project"
      >
        <Search className="h-4 w-4" />
        <span>Jump to…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px]">{shortcut}</kbd>
      </button>

      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl data-open:slide-in-from-top-[18%]">
          <DialogTitle className="sr-only">Jump to a project</DialogTitle>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onInputKey}
              placeholder="Project code or name, then a tab — e.g. 004 boq"
              className="h-12 w-full bg-transparent pr-8 text-sm outline-hidden placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded
              aria-controls="command-palette-results"
              aria-activedescendant={results[active] ? `cp-${results[active].key}` : undefined}
            />
          </div>
          <ul id="command-palette-results" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No project or tab matches “{query}”.</li>
            ) : results.map((r, i) => (
              <li
                key={r.key}
                id={`cp-${r.key}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(i)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm", i === active && "bg-muted")}
              >
                <span className="w-32 shrink-0 truncate font-mono text-xs text-muted-foreground">{r.project.project_code}</span>
                <span className="min-w-0 flex-1 truncate">{r.project.project_name}</span>
                {r.destination && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                    <ArrowRight className="h-3 w-3" /> {r.destination.label}
                  </span>
                )}
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ to move · Enter to open · Esc to close</span>
            <span>{shortcut} anywhere</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
