"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2, Filter, X, Plus, Users, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type Project } from "@/components/projects/project-edit-sheet";
import { ProjectSetupWizard } from "@/components/projects/project-setup-wizard";
import { NamingProjectWizard } from "@/components/naming/naming-project-wizard";
import { ProjectStakeholdersTab } from "@/components/projects/project-stakeholders-tab";
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

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};

export function ProjectListPage() {
  const { refreshProjects } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showNamingCreate, setShowNamingCreate] = useState(false);
  const [teamProject, setTeamProject] = useState<Project | null>(null);

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

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.project_name.toLowerCase().includes(q) && !p.project_code.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter && p.project_type !== typeFilter) return false;
      if (statusFilter && p.project_status !== statusFilter) return false;
      return true;
    });
  }, [projects, search, typeFilter, statusFilter]);

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

  const wizardOpen = !!(selected || showCreate || showNamingCreate);

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
      ) : showNamingCreate ? (
        <NamingProjectWizard
          project={null}
          onClose={() => setShowNamingCreate(false)}
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowNamingCreate(true)} size="sm" variant="outline">
                <Plus className="mr-1.5 h-4 w-4" />
                New (Template)
              </Button>
              <Button onClick={() => setShowCreate(true)} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                New Project
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
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-border bg-background py-2 pl-7 pr-8 text-sm appearance-none outline-hidden focus:border-primary"
              >
                <option value="">All Types</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
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
          </div>

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
                      onClick={() => setSelected(p)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        false,
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        {p.project_name}
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

          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {projects.length} projects
          </p>
        </div>
      )}
    </div>
  );
}
