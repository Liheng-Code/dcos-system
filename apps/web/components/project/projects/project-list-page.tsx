"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listProfilesOfIdAndFullName, listProjects } from "@/lib/project/projects/projects-queries";
import { Search, Loader2, Filter, X, Plus, Users, LayoutGrid, List, Calendar, MapPin, DollarSign, Handshake, HardHat as HardHatIcon, SquareKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type Project } from "@/lib/project/projects/project-types";
import {
  parseCreateKind,
  parseProjectListParams,
  projectHref,
  projectListQuery,
  type ProjectCreateKind,
  type ProjectListState,
} from "@/lib/project/projects/project-routes";
import { readStoredView, rememberList } from "@/components/project/projects/project-list-memory";
import { NewProjectForm } from "@/components/project/projects/new-project-form";
import { ProjectTable } from "@/components/project/projects/list/project-table";
import { TenderBoard } from "@/components/project/projects/list/tender-board";
import { loadListSignalInputs } from "@/lib/project/projects/overview-queries";
import { liveSignals, tenderSignals, type ProjectSignals, type TenderSignalInput } from "@/lib/project/projects/list-signals";
import { isoDay } from "@/lib/project/projects/attention";
import { ProjectMapThumb } from "@/components/project/projects/project-map-thumb";
import { useProject } from "@/components/dashboard/project-context";
import { PROJECT_SECTORS, sectorLabel, buildingTypeLabel } from "@/lib/project-categories";

const TYPE_LABELS: Record<string, string> = {
  tender: "Tender",
  awarded: "Awarded",
  internal: "Internal",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-600 border-amber-200",
  pending_approval: "bg-orange-500/10 text-orange-600 border-orange-200",
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  on_hold: "bg-blue-500/10 text-blue-600 border-blue-200",
  completed: "bg-gray-500/10 text-gray-500 border-gray-200",
  archived: "bg-slate-500/10 text-slate-600 border-slate-200",
};

const STATUS_BORDERS: Record<string, string> = {
  draft: "border-t-amber-500",
  pending_approval: "border-t-orange-500",
  active: "border-t-emerald-500",
  on_hold: "border-t-blue-500",
  completed: "border-t-gray-400",
  archived: "border-t-slate-500",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};

type PhaseTab = "precontract" | "postcontract";

// The list's view, filters and layout live in the URL (see lib/project/projects/project-routes.ts);
// opening a project goes to /dashboard/projects/[code], and ?new=<kind> opens a create flow.
export function ProjectListPage() {
  const { refreshProjects } = useProject();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [signalInputs, setSignalInputs] = useState<{ tenders: Record<string, TenderSignalInput>; overdueTasks: Record<string, number> }>({ tenders: {}, overdueTasks: {} });

  const [fallbackView] = useState(() => readStoredView() ?? "pipeline");
  const list = useMemo(() => parseProjectListParams(searchParams, fallbackView), [searchParams, fallbackView]);
  const createKind = parseCreateKind(searchParams.get("new"));

  const setList = useCallback((patch: Partial<ProjectListState>) => {
    router.replace(`${pathname}?${projectListQuery({ ...list, ...patch })}`, { scroll: false });
  }, [router, pathname, list]);

  useEffect(() => {
    rememberList(list.view, projectListQuery(list));
  }, [list]);

  // Typing filters locally; the URL follows after a short pause.
  const [search, setSearch] = useState(list.q);
  useEffect(() => {
    if (search === list.q) return;
    const timer = setTimeout(() => setList({ q: search }), 250);
    return () => clearTimeout(timer);
  }, [search, list.q, setList]);

  const phaseTab: PhaseTab = list.view === "pipeline" ? "precontract" : "postcontract";
  const setPhaseTab = (tab: PhaseTab) => setList({ view: tab === "precontract" ? "pipeline" : "live", type: "" });
  const typeFilter = list.type;
  const statusFilter = list.status;
  const sectorFilter = list.sector;
  const viewMode = list.layout;
  const setTypeFilter = (type: string) => setList({ type });
  const setStatusFilter = (status: string) => setList({ status });
  const setSectorFilter = (sector: string) => setList({ sector });
  const setViewMode = (layout: ProjectListState["layout"]) => setList({ layout });

  function fetchProjects() {
    listProjects()
      .then(({ data }) => {
        if (data) setProjects(data as Project[]);
        setLoading(false);
      });

    loadListSignalInputs(isoDay(new Date())).then(setSignalInputs).catch(() => {});

    listProfilesOfIdAndFullName("id, full_name").then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        for (const p of data) map[p.id] = p.full_name;
        setStaffMap(map);
      }
    });
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const precontractProjects = useMemo(() => projects.filter((p) => p.project_type === "tender"), [projects]);
  const postcontractProjects = useMemo(() => projects.filter((p) => p.project_type !== "tender"), [projects]);

  // Forward/reverse link maps between a tender row and the post-contract project
  // it was assigned to (source_tender_project_id), built from the single fetch
  // above rather than a per-card query.
  const awardedByTenderId = useMemo(() => {
    const map: Record<string, Project> = {};
    for (const p of projects) {
      if (p.source_tender_project_id) map[p.source_tender_project_id] = p;
    }
    return map;
  }, [projects]);
  const projectById = useMemo(() => {
    const map: Record<string, Project> = {};
    for (const p of projects) map[p.id] = p;
    return map;
  }, [projects]);

  // Stage, health and next deadline per project (lib/project/projects/list-signals.ts).
  const signals = useMemo(() => {
    const today = isoDay(new Date());
    const out: Record<string, ProjectSignals> = {};
    for (const p of projects) {
      out[p.id] = p.project_type === "tender"
        ? tenderSignals(signalInputs.tenders[p.id] ?? null, today)
        : liveSignals(p, signalInputs.overdueTasks[p.id] ?? 0, today);
    }
    return out;
  }, [projects, signalInputs]);

  const filtered = useMemo(() => {
    const scoped = phaseTab === "precontract" ? precontractProjects : postcontractProjects;
    const q = list.q.toLowerCase();
    return scoped.filter((p) => {
      if (q && !p.project_name.toLowerCase().includes(q) && !p.project_code.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter && p.project_type !== typeFilter) return false;
      if (statusFilter && p.project_status !== statusFilter) return false;
      if (sectorFilter && p.category !== sectorFilter) return false;
      return true;
    });
  }, [precontractProjects, postcontractProjects, phaseTab, list.q, typeFilter, statusFilter, sectorFilter]);

  // Tenders by nearest deadline (none last); live projects keep newest first.
  const ordered = useMemo(() => {
    if (phaseTab !== "precontract") return filtered;
    const key = (p: Project) => signals[p.id]?.deadline?.date ?? "9999";
    return [...filtered].sort((a, b) => key(a).localeCompare(key(b)));
  }, [filtered, phaseTab, signals]);

  // Create flows are pushed, so Back closes them.
  const openCreate = (kind: ProjectCreateKind) => router.push(`${pathname}?${projectListQuery(list, { new: kind })}`);
  const closeCreate = () => router.replace(`${pathname}?${projectListQuery(list)}`);

  // A new project opens straight away: a tender at its first section, an awarded project in the
  // short guided setup.
  function handleCreated(created: Project) {
    refreshProjects();
    router.push(projectHref(created.project_code, created.project_type === "tender" ? null : "setup"));
  }

  // Badges and the team icon sit inside a card link, so they navigate without following it.
  function goTo(e: React.MouseEvent, href: string) {
    e.preventDefault();
    e.stopPropagation();
    router.push(href);
  }

  if (createKind) {
    return <NewProjectForm initialKind={createKind} onCancel={closeCreate} onCreated={handleCreated} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPhaseTab("precontract")}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-2 px-5 py-2.5 text-sm font-semibold transition-all",
                  phaseTab === "precontract"
                    ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/25"
                    : "bg-background text-muted-foreground border-border hover:border-amber-300 hover:text-foreground",
                )}
              >
                <Handshake className="h-4 w-4" />
                Pre-Contract
                <span className={cn(
                  "inline-flex items-center justify-center rounded-full px-1.5 py-0 text-xs font-bold min-w-[1.25rem]",
                  phaseTab === "precontract" ? "bg-white/25 text-white" : "bg-muted text-muted-foreground",
                )}>
                  {precontractProjects.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPhaseTab("postcontract")}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-2 px-5 py-2.5 text-sm font-semibold transition-all",
                  phaseTab === "postcontract"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25"
                    : "bg-background text-muted-foreground border-border hover:border-emerald-300 hover:text-foreground",
                )}
              >
                <HardHatIcon className="h-4 w-4" />
                Post-Contract
                <span className={cn(
                  "inline-flex items-center justify-center rounded-full px-1.5 py-0 text-xs font-bold min-w-[1.25rem]",
                  phaseTab === "postcontract" ? "bg-white/25 text-white" : "bg-muted text-muted-foreground",
                )}>
                  {postcontractProjects.length}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => openCreate(phaseTab === "precontract" ? "tender" : "awarded")} size="default" className="rounded-xl font-medium">
                <Plus className="mr-1.5 h-4 w-4" />
                New project
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-hidden placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            {phaseTab === "postcontract" && (
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-lg border border-border bg-background py-2 pl-7 pr-8 text-sm appearance-none outline-hidden focus:border-primary"
                >
                  <option value="">All Types</option>
                  {Object.entries(TYPE_LABELS).filter(([k]) => k !== "tender").map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-background py-2 px-3 text-sm appearance-none outline-hidden focus:border-primary"
            >
              <option value="">All Status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="rounded-lg border border-border bg-background py-2 px-3 text-sm appearance-none outline-hidden focus:border-primary"
            >
              <option value="">All Sectors</option>
              {PROJECT_SECTORS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {(search || typeFilter || statusFilter || sectorFilter) && (
              <button
                type="button"
                onClick={() => { setSearch(""); setList({ q: "", type: "", status: "", sector: "" }); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
            <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5" role="group" aria-label="Layout">
              {([
                { value: "list", title: "Table", icon: List },
                { value: "card", title: "Cards", icon: LayoutGrid },
                ...(phaseTab === "precontract" ? [{ value: "board", title: "Board by stage", icon: SquareKanban }] : []),
              ] as { value: ProjectListState["layout"]; title: string; icon: typeof List }[]).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  title={o.title}
                  aria-label={o.title}
                  aria-pressed={viewMode === o.value}
                  onClick={() => setViewMode(o.value)}
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    viewMode === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <o.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {viewMode === "board" ? (
            <TenderBoard projects={ordered} tenders={signalInputs.tenders} signals={signals} staffMap={staffMap} />
          ) : viewMode === "card" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.length === 0 ? (
                <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
                  No projects found
                </div>
              ) : (
                ordered.map((p) => (
                  <Link
                    key={p.id}
                    href={projectHref(p.project_code)}
                    className={cn(
                      "group flex flex-col rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5",
                      "border-t-4",
                      STATUS_BORDERS[p.project_status] ?? "border-t-muted",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm leading-tight truncate group-hover:text-primary transition-colors">
                          {p.project_name}
                        </h3>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {p.project_code}
                        </p>
                      </div>
                      <span className={cn(
                        "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        STATUS_COLORS[p.project_status] ?? "bg-muted text-muted-foreground border-border",
                      )}>
                        {STATUS_LABELS[p.project_status] ?? p.project_status.replace(/_/g, " ")}
                      </span>
                    </div>

                    {p.project_type === "tender" && awardedByTenderId[p.id] && (
                      <div
                        role="button"
                        onClick={(e) => goTo(e, projectHref(awardedByTenderId[p.id].project_code))}
                        className="mb-3 inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      >
                        Awarded → {awardedByTenderId[p.id].project_code}
                      </div>
                    )}
                    {p.project_type !== "tender" && p.source_tender_project_id && projectById[p.source_tender_project_id] && (
                      <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        From tender: {projectById[p.source_tender_project_id].project_code}
                      </span>
                    )}

                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {p.description}
                      </p>
                    )}

                    {p.latitude != null && p.longitude != null && (
                      <ProjectMapThumb
                        lat={p.latitude}
                        lng={p.longitude}
                        className="mb-3 h-28 w-full"
                      />
                    )}

                    <div className="mt-auto flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                          {TYPE_LABELS[p.project_type] ?? p.project_type}
                        </span>
                        {p.category && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {sectorLabel(p.category)}
                            {p.building_type ? ` › ${buildingTypeLabel(p.building_type)}` : ""}
                          </span>
                        )}
                      </div>
                      {p.project_manager_id && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Users className="h-3 w-3 shrink-0" />
                          <span className="truncate">{staffMap[p.project_manager_id] ?? "Unassigned"}</span>
                        </div>
                      )}
                      {p.location && (
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{p.location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        {p.contract_value != null && (
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3 shrink-0" />
                            <span>{p.currency} {p.contract_value.toLocaleString()}</span>
                          </div>
                        )}
                        {p.start_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span>{p.start_date}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {p.start_date && p.end_date ? `${p.start_date} → ${p.end_date}` : p.start_date ?? "No dates set"}
                      </span>
                      <div
                        role="button"
                        title="Manage team"
                        onClick={(e) => goTo(e, projectHref(p.project_code, "team"))}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Users className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          ) : (
            <ProjectTable
              projects={ordered}
              signals={signals}
              staffMap={staffMap}
              awardedByTenderId={awardedByTenderId}
              projectById={projectById}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {(phaseTab === "precontract" ? precontractProjects : postcontractProjects).length} projects
          </p>
        </div>
    </div>
  );
}
