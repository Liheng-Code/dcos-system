"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/project/projects/project-types";
import { projectHref } from "@/lib/project/projects/project-routes";
import { STAGE_LABELS, STAGE_PATH, type TenderStage } from "@/lib/qs/tender-lifecycle";
import type { ProjectSignals, TenderSignalInput } from "@/lib/project/projects/list-signals";
import { ToneLabel } from "@/components/project/projects/list/project-table";

// Outcomes after the lifecycle path; empty outcome columns are hidden to keep the board short.
const COLUMNS: TenderStage[] = [...STAGE_PATH.map((s) => s.stage), "awarded", "unsuccessful", "closed"];
const OUTCOMES: TenderStage[] = ["awarded", "unsuccessful", "closed"];

interface TenderBoardProps {
  projects: Project[];
  tenders: Record<string, TenderSignalInput>;
  signals: Record<string, ProjectSignals>;
  staffMap: Record<string, string>;
}

// Tenders grouped by lifecycle stage. Read-only: a stage changes only through the tender's own
// lifecycle actions (lib/qs/tender-lifecycle.ts), so there is no drag and drop.
export function TenderBoard({ projects, tenders, signals, staffMap }: TenderBoardProps) {
  const byStage = new Map<TenderStage, Project[]>();
  for (const p of projects) {
    const stage = tenders[p.id]?.tender_stage ?? "opportunity";
    byStage.set(stage, [...(byStage.get(stage) ?? []), p]);
  }
  const columns = COLUMNS.filter((c) => !OUTCOMES.includes(c) || (byStage.get(c)?.length ?? 0) > 0);

  return (
    <div className="-mx-1 overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3 px-1">
        {columns.map((stage) => {
          const cards = byStage.get(stage) ?? [];
          return (
            <section key={stage} className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/30" aria-label={STAGE_LABELS[stage]}>
              <header className="flex items-center justify-between px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{STAGE_LABELS[stage]}</h3>
                <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground">{cards.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {cards.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground/70">None</p>
                ) : cards.map((p) => {
                  const s = signals[p.id];
                  return (
                    <Link
                      key={p.id}
                      href={projectHref(p.project_code)}
                      className={cn("block rounded-lg border border-border bg-card p-3 shadow-xs transition-shadow hover:shadow-md")}
                    >
                      <p className="truncate text-sm font-medium">{p.project_name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{p.project_code}</p>
                      {s && <ToneLabel tone={s.health.tone} className="mt-2">{s.health.label}</ToneLabel>}
                      {p.project_manager_id && staffMap[p.project_manager_id] && (
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">{staffMap[p.project_manager_id]}</p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
