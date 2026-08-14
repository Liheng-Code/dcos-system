"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2, Filter, X, Plus, Users, ChevronLeft, LayoutGrid, List, Calendar, MapPin, DollarSign, Handshake, HardHat as HardHatIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type Project } from "@/components/projects/project-edit-sheet";
import { ProjectSetupWizard } from "@/components/projects/project-setup-wizard";
import { PrecontractWizard } from "@/components/projects/precontract-wizard";
import { NamingProjectWizard } from "@/components/naming/naming-project-wizard";
import { ProjectStakeholdersTab } from "@/components/projects/project-stakeholders-tab";
import { PrecontractDetail } from "@/components/projects/precontract-detail";
import { PostcontractDetail } from "@/components/projects/postcontract-detail";
import { useProject } from "@/components/dashboard/project-context";

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

export function ProjectListPage() {
  const { refreshProjects } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [phaseTab, setPhaseTab] = useState<PhaseTab>("precontract");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPrecontractCreate, setShowPrecontractCreate] = useState(false);
  const [showPrecontractDetail, setShowPrecontractDetail] = useState(false);
  const [showPostcontractDetail, setShowPostcontractDetail] = useState(false);
  const [showNamingCreate, setShowNamingCreate] = useState(false);
  const [teamProject, setTeamProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  function fetchProjects() {
    const supabase = createClient();
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setProjects(data as Project[]);
        setLoading(false);
      });

    supabase.from("profiles").select("id, full_name").then(({ data }) => {
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

  const filtered = useMemo(() => {
    const scoped = phaseTab === "precontract" ? precontractProjects : postcontractProjects;
    return scoped.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.project_name.toLowerCase().includes(q) && !p.project_code.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter && p.project_type !== typeFilter) return false;
      if (statusFilter && p.project_status !== statusFilter) return false;
      return true;
    });
  }, [precontractProjects, postcontractProjects, phaseTab, search, typeFilter, statusFilter]);

  function handleSave(updated: Project) {
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
    setSelected(null);
    setShowCreate(false);
    setShowPrecontractCreate(false);
    setShowPrecontractDetail(false);
    setShowNamingCreate(false);
    refreshProjects();
  }

  function formatValue(value: number | null, currency: string): string {
    if (value === null) return "—";
    return `${currency} ${value.toLocaleString()}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const wizardOpen = !!(selected || showCreate || showPrecontractCreate || showNamingCreate);
  const showDetail = showPrecontractDetail && selected?.project_type === "tender";
  const showPostDetail = showPostcontractDetail && selected && selected.project_type !== "tender";

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {teamProject ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 border-b px-6 py-4">
            <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setTeamProject(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h2 className="text-lg font-semibold">{teamProject.project_name}</h2>
              <p className="text-xs text-muted-foreground">{teamProject.project_code} — Team & Stakeholders</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto w-full">
            <ProjectStakeholdersTab projectId={teamProject.id} />
          </div>
        </div>
      ) : showDetail ? (
        <PrecontractDetail
          project={selected!}
          onBack={() => { setShowPrecontractDetail(false); setSelected(null); }}
          onUpdate={handleSave}
        />
      ) : showPostDetail ? (
        <PostcontractDetail
          project={selected!}
          onBack={() => { setShowPostcontractDetail(false); setSelected(null); }}
          onUpdate={handleSave}
        />
      ) : showNamingCreate ? (
        <NamingProjectWizard
          project={null}
          onClose={() => setShowNamingCreate(false)}
          onSave={handleSave}
        />
      ) : showPrecontractCreate ? (
        <PrecontractWizard
          project={selected}
          onClose={() => { setShowPrecontractCreate(false); setSelected(null); }}
          onSave={handleSave}
        />
      ) : wizardOpen ? (
        <ProjectSetupWizard
          project={selected}
          onClose={() => { setSelected(null); setShowCreate(false); }}
          onSave={handleSave}
        />
      ) : (
        <div className="flex flex-col gap-4">
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

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filtered.length} project{filtered.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              {phaseTab === "precontract" ? (
                <Button onClick={() => { setSelected(null); setShowPrecontractCreate(true); }} size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Pre-Contract
                </Button>
              ) : (
                <>
                  <Button onClick={() => setShowNamingCreate(true)} size="sm" variant="outline">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New (Template)
                  </Button>
                  <Button onClick={() => setShowCreate(true)} size="sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New Project
                  </Button>
                </>
              )}
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
            {(search || typeFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
            <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              <button
                type="button"
                title="Card view"
                onClick={() => setViewMode("card")}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  viewMode === "card"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="List view"
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  viewMode === "list"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {viewMode === "card" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.length === 0 ? (
                <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
                  No projects found
                </div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (p.project_type === "tender") {
                        setSelected(p);
                        setShowPrecontractDetail(true);
                      } else {
                        setSelected(p);
                        setShowPostcontractDetail(true);
                      }
                    }}
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
                        onClick={(e) => { e.stopPropagation(); setSelected(awardedByTenderId[p.id]); setShowPrecontractDetail(false); setShowPostcontractDetail(true); }}
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

                    <div className="mt-auto flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                          {TYPE_LABELS[p.project_type] ?? p.project_type}
                        </span>
                        {p.category && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {p.category}
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
                        onClick={(e) => { e.stopPropagation(); setTeamProject(p); }}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Users className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Project</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Code</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">PM</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Value</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Dates</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Team</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">
                        No projects found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => {
                          if (p.project_type === "tender") {
                            setSelected(p);
                            setShowPrecontractDetail(true);
                          } else {
                            setSelected(p);
                            setShowPostcontractDetail(true);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                      >
                        <td className="px-3 py-2.5 font-medium text-foreground">
                          {p.project_name}
                          {p.project_type === "tender" && awardedByTenderId[p.id] && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelected(awardedByTenderId[p.id]); setShowPrecontractDetail(false); setShowPostcontractDetail(true); }}
                              className="mt-0.5 block w-fit rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              Awarded → {awardedByTenderId[p.id].project_code}
                            </button>
                          )}
                          {p.project_type !== "tender" && p.source_tender_project_id && projectById[p.source_tender_project_id] && (
                            <span className="mt-0.5 block w-fit rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                              From tender: {projectById[p.source_tender_project_id].project_code}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                          {p.project_code}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">
                            {TYPE_LABELS[p.project_type] ?? p.project_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {p.project_manager_id ? (staffMap[p.project_manager_id] ?? "—") : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {formatValue(p.contract_value, p.currency)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {p.start_date ? p.start_date : "—"}
                          {p.end_date ? ` → ${p.end_date}` : ""}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                            STATUS_COLORS[p.project_status] ?? "bg-muted text-muted-foreground border-border",
                          )}>
                            {STATUS_LABELS[p.project_status] ?? p.project_status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            title="Manage team"
                            onClick={(e) => { e.stopPropagation(); setTeamProject(p); }}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground border border-border hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <Users className="h-3 w-3" />
                            Team
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {(phaseTab === "precontract" ? precontractProjects : postcontractProjects).length} projects
          </p>
        </div>
      )}
    </div>
  );
}
