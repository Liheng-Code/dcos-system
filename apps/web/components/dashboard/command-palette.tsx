"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { searchPalette, type PaletteProject } from "@/lib/project/projects/command-search";

type PaletteFilter = "all" | "tender" | "awarded" | "on_hold" | "completed" | "archived";

function matchesPaletteFilter(p: PaletteProject, filter: PaletteFilter): boolean {
  const status = p.project_status ?? "active";
  switch (filter) {
    case "all":
      return true;
    case "on_hold":
      return status === "on_hold";
    case "completed":
      return status === "completed";
    case "archived":
      return status === "archived";
    case "tender":
      return p.project_type === "tender" && status !== "on_hold" && status !== "archived";
    case "awarded":
      return p.project_type !== "tender" && status !== "on_hold" && status !== "completed" && status !== "archived";
  }
}

function ProjectBadges({ project }: { project: PaletteProject }) {
  const status = project.project_status ?? "active";
  const isTender = project.project_type === "tender";
  const isAwarded = project.project_type === "awarded";

  return (
    <span className="flex shrink-0 items-center gap-1">
      {/* Phase / Type badge */}
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
          isTender
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : isAwarded
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-slate-100 text-slate-700",
        )}
      >
        {isTender ? "Tender" : isAwarded ? "Awarded" : "Internal"}
      </span>

      {/* Lifecycle status badge */}
      {status === "on_hold" && (
        <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-orange-700">
          On Hold
        </span>
      )}
      {status === "completed" && (
        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-sky-700">
          Completed
        </span>
      )}
      {status === "archived" && (
        <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold leading-none text-slate-600">
          Archived
        </span>
      )}
    </span>
  );
}

// Ctrl+K (⌘K on a Mac): jump to any project, or straight to one of its tabs ("004 boq").
export function CommandPalette() {
  const router = useRouter();
  const { projects } = useProject();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PaletteFilter>("all");
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

  const counts = useMemo(() => {
    return {
      all: projects.length,
      tender: projects.filter((p) => matchesPaletteFilter(p, "tender")).length,
      awarded: projects.filter((p) => matchesPaletteFilter(p, "awarded")).length,
      on_hold: projects.filter((p) => matchesPaletteFilter(p, "on_hold")).length,
      completed: projects.filter((p) => matchesPaletteFilter(p, "completed")).length,
      archived: projects.filter((p) => matchesPaletteFilter(p, "archived")).length,
    };
  }, [projects]);

  const filteredProjects = useMemo(
    () => projects.filter((p) => matchesPaletteFilter(p, filter)),
    [projects, filter],
  );

  const results = useMemo(() => searchPalette(query, filteredProjects, 20), [query, filteredProjects]);

  function openChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setFilter("all");
      setActive(0);
    }
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

  const filterTabs: { id: PaletteFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "tender", label: "Tender", count: counts.tender },
    { id: "awarded", label: "Awarded", count: counts.awarded },
    { id: "on_hold", label: "On Hold", count: counts.on_hold },
    { id: "completed", label: "Completed", count: counts.completed },
    { id: "archived", label: "Archived", count: counts.archived },
  ];

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
        <DialogContent className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl data-open:slide-in-from-top-[14%]">
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

          {/* Status & Phase Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-b bg-slate-50/70 px-3 py-2">
            {filterTabs.map((tab) => {
              const isSelected = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setFilter(tab.id);
                    setActive(0);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums",
                      isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <ul id="command-palette-results" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No project or tab matches {query ? `“${query}”` : "this filter"}.
              </li>
            ) : results.map((r, i) => (
              <li
                key={r.key}
                id={`cp-${r.key}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(i)}
                className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm", i === active && "bg-muted")}
              >
                <span className="w-32 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {r.project.project_code}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {r.project.project_name}
                </span>
                <ProjectBadges project={r.project} />
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
