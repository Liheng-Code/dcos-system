"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, PauseCircle, Pin, PlayCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import type { Project } from "@/lib/project/projects/project-types";
import { projectHref } from "@/lib/project/projects/project-routes";
import type { ProjectSignals, Tone } from "@/lib/project/projects/list-signals";

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-red-700 dark:text-red-400",
  muted: "text-muted-foreground",
};
const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  muted: "bg-muted-foreground/40",
};

export function ToneLabel({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", TONE_TEXT[tone], className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      {children}
    </span>
  );
}

export const formatDay = (d: string) =>
  new Date(d.length > 10 ? d : `${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

interface ProjectTableProps {
  projects: Project[];
  signals: Record<string, ProjectSignals>;
  staffMap: Record<string, string>;
  awardedByTenderId: Record<string, Project>;
  projectById: Record<string, Project>;
  onStatusChange?: (project: Project, nextStatus: string) => void;
}

// The default Projects view: one row per project with what needs a decision (stage, health,
// next deadline). Row actions appear on hover; the whole row opens the project.
export function ProjectTable({ projects, signals, staffMap, awardedByTenderId, projectById, onStatusChange }: ProjectTableProps) {
  const router = useRouter();
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const th = "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className={th}>Project</th>
            <th className={th}>Stage</th>
            <th className={th}>Health</th>
            <th className={th}>Next deadline</th>
            <th className={cn(th, "hidden md:table-cell")}>Manager</th>
            <th className={cn(th, "hidden lg:table-cell text-right")}>Value</th>
            <th className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {projects.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground">No projects found</td></tr>
          ) : projects.map((p) => {
            const s = signals[p.id];
            const awarded = p.project_type === "tender" ? awardedByTenderId[p.id] : undefined;
            const source = p.source_tender_project_id ? projectById[p.source_tender_project_id] : undefined;
            const isCurrent = selectedProjectId === p.id;
            const isOnHold = p.project_status === "on_hold";
            const isArchived = p.project_status === "archived" || p.project_status === "completed";
            const resumeStatus = "active";
            return (
              <tr key={p.id} onClick={() => router.push(projectHref(p.project_code))} className="group cursor-pointer transition-colors hover:bg-muted/50">
                <td className="max-w-xs px-3 py-2.5">
                  <Link href={projectHref(p.project_code)} onClick={stop} className="block truncate font-medium text-foreground hover:underline">
                    {p.project_name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{p.project_code}</span>
                    <span className="rounded border border-border bg-muted/60 px-1 text-[10px] capitalize">
                      {p.project_type === "tender" ? "Tender" : p.project_type}
                    </span>
                    {isCurrent && <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">Current</span>}
                    {awarded && (
                      <Link href={projectHref(awarded.project_code)} onClick={stop} className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100">
                        Awarded → {awarded.project_code}
                      </Link>
                    )}
                    {source && <span className="text-[10px]">from tender {source.project_code}</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5">{s && <ToneLabel tone={s.stage.tone}>{s.stage.label}</ToneLabel>}</td>
                <td className="px-3 py-2.5">{s && <ToneLabel tone={s.health.tone}>{s.health.label}</ToneLabel>}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                  {s?.deadline ? (
                    <>
                      <span className="text-foreground">{formatDay(s.deadline.date)}</span>
                      <span className="block text-muted-foreground">{s.deadline.label}</span>
                    </>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                  {p.project_manager_id ? (staffMap[p.project_manager_id] ?? "—") : "—"}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted-foreground lg:table-cell">
                  {p.contract_value != null ? `${p.currency} ${p.contract_value.toLocaleString()}` : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {onStatusChange && (
                      <>
                        {isOnHold || isArchived ? (
                          <button
                            type="button"
                            title={isOnHold ? "Resume project" : "Restore to active"}
                            aria-label={`Resume ${p.project_name}`}
                            onClick={(e) => {
                              stop(e);
                              onStatusChange(p, resumeStatus);
                            }}
                            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Put on hold"
                            aria-label={`Put ${p.project_name} on hold`}
                            onClick={(e) => {
                              stop(e);
                              onStatusChange(p, "on_hold");
                            }}
                            className="rounded-md p-1.5 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!isArchived && (
                          <button
                            type="button"
                            title="Archive project"
                            aria-label={`Archive ${p.project_name}`}
                            onClick={(e) => {
                              stop(e);
                              onStatusChange(p, "archived");
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                    <Link
                      href={projectHref(p.project_code, "team")}
                      onClick={stop}
                      title="Team"
                      aria-label={`Team of ${p.project_name}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Users className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      title={isCurrent ? "Current project" : "Set as current project"}
                      aria-label={`Set ${p.project_name} as the current project`}
                      disabled={isCurrent}
                      onClick={(e) => {
                        stop(e);
                        setSelectedProjectId(p.id);
                        toast.success(`${p.project_code} is now the current project`);
                      }}
                      className={cn("rounded-md p-1.5 hover:bg-muted", isCurrent ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
