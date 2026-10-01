"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, Plus, Building2, UsersRound, FolderKanban, PieChart,
  Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KPICard } from "@/components/ui/kpi-card";
import { useProject } from "@/components/dashboard/project-context";
import { connectStakeholder, disconnectStakeholder } from "@/lib/stakeholder-assignment";
import {
  StakeholderEditSheet,
  type Stakeholder,
  type StakeholderStaff,
} from "@/components/stakeholders/stakeholder-edit-sheet";
import { StakeholderCompanyCard } from "@/components/stakeholders/stakeholder-company-card";
import { BulkHrAssignDialog } from "@/components/stakeholders/bulk-hr-assign-dialog";
import {
  ALL_TYPE_LABELS, EXTERNAL_TYPE_OPTIONS, INTERNAL_TYPE_OPTIONS, ALL_TYPE_OPTIONS,
} from "@/components/stakeholders/constants";
import { deleteStakeholderById, getProfileById, listProjectStakeholders, listStakeholderStaff, listStakeholders } from "@/lib/stakeholders/stakeholders-queries";

type CategoryFilter = "all" | "internal" | "external";

interface ProjectLink {
  stakeholder_id: string;
  project_id: string;
  created_at: string | null;
}

// Last 3 calendar months, oldest first.
function lastThreeMonths() {
  const now = new Date();
  return [2, 1, 0].map((back) => {
    const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
    return {
      label: start.toLocaleString("en-US", { month: "short" }).toUpperCase(),
      start: start.getTime(),
      end: end.getTime(),
    };
  });
}

export function StakeholderListPage() {
  const { selectedProjectId, selectedProject } = useProject();

  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [staff, setStaff] = useState<StakeholderStaff[]>([]);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<Stakeholder | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkTarget, setBulkTarget] = useState<Stakeholder | null>(null);

  const loadData = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      listStakeholders(),
      listStakeholderStaff(),
      listProjectStakeholders(),
    ]).then(([stRes, sfRes, plRes]) => {
      if (stRes.data) setStakeholders(stRes.data as Stakeholder[]);
      if (sfRes.data) setStaff(sfRes.data as StakeholderStaff[]);
      if (plRes.data) setLinks(plRes.data as ProjectLink[]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadData();
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      getProfileById(data.user.id)
        .then(({ data: p }) => { if (p) setIsAdmin(p.role === "admin"); });
    });
  }, [loadData]);

  // ── Derived maps ──────────────────────────────────────────────────────────
  const staffByStakeholder = useMemo(() => {
    const map: Record<string, StakeholderStaff[]> = {};
    for (const s of staff) {
      (map[s.stakeholder_id] ??= []).push(s);
    }
    return map;
  }, [staff]);

  const linksByStakeholder = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const l of links) {
      (map[l.stakeholder_id] ??= []).push(l.project_id);
    }
    return map;
  }, [links]);

  const months = useMemo(() => lastThreeMonths(), []);

  const trendByStakeholder = useMemo(() => {
    const labels = months.map((m) => m.label);
    const map: Record<string, { labels: string[]; values: number[] }> = {};
    for (const s of stakeholders) {
      const rows = links.filter((l) => l.stakeholder_id === s.id);
      const values = months.map((m) =>
        rows.filter((r) => {
          if (!r.created_at) return false;
          const t = new Date(r.created_at).getTime();
          return t >= m.start && t < m.end;
        }).length,
      );
      map[s.id] = { labels, values };
    }
    return map;
  }, [stakeholders, links, months]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const total = stakeholders.length;
  const internalCount = stakeholders.filter((s) => s.category === "internal").length;
  const externalCount = stakeholders.filter((s) => s.category === "external").length;
  const activeProjectsCover = new Set(links.map((l) => l.project_id)).size;
  const externalRatio = total > 0 ? Math.round((externalCount / total) * 100) : 0;

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stakeholders.filter((s) => {
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (typeFilter && s.stakeholder_type !== typeFilter) return false;
      if (q) {
        const typeLabel = (ALL_TYPE_LABELS[s.stakeholder_type] ?? "").toLowerCase();
        const staffNames = (staffByStakeholder[s.id] ?? []).map((m) => m.full_name.toLowerCase());
        const hay = [
          s.organization_name.toLowerCase(),
          (s.short_name ?? "").toLowerCase(),
          (s.company_code ?? "").toLowerCase(),
          typeLabel,
          ...staffNames,
        ];
        if (!hay.some((h) => h.includes(q))) return false;
      }
      return true;
    });
  }, [stakeholders, categoryFilter, typeFilter, search, staffByStakeholder]);

  const typeOptions =
    categoryFilter === "internal" ? INTERNAL_TYPE_OPTIONS
      : categoryFilter === "external" ? EXTERNAL_TYPE_OPTIONS
        : ALL_TYPE_OPTIONS;

  // ── Mutations ─────────────────────────────────────────────────────────────
  function handleSave(updated: Stakeholder) {
    setStakeholders((prev) => {
      const idx = prev.findIndex((s) => s.id === updated.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [updated, ...prev];
    });
    setSelected(null);
    setShowCreate(false);
    loadData();
  }

  async function handleDelete(stakeholder: Stakeholder) {
    if (!confirm(`Delete "${stakeholder.organization_name}"? This also removes all associated staff and teams.`)) return;
    const { error } = await deleteStakeholderById(stakeholder.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Stakeholder deleted");
    setStakeholders((prev) => prev.filter((s) => s.id !== stakeholder.id));
    setSelected(null);
    setShowCreate(false);
  }

  async function handleConnect(stakeholder: Stakeholder) {
    if (!selectedProjectId) { toast.error("Select a project first"); return; }
    setBusyId(stakeholder.id);
    const { error } = await connectStakeholder(createClient(), selectedProjectId, stakeholder);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Assigned to ${selectedProject?.project_name ?? "project"}`);
    loadData();
  }

  async function handleDisconnect(stakeholder: Stakeholder) {
    if (!selectedProjectId) return;
    if (!confirm(`Disconnect "${stakeholder.organization_name}" from ${selectedProject?.project_name ?? "this project"}?`)) return;
    setBusyId(stakeholder.id);
    const { error } = await disconnectStakeholder(createClient(), selectedProjectId, stakeholder.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Disconnected from project");
    loadData();
  }

  const hasActiveFilters = !!(search || typeFilter || categoryFilter !== "all");

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pb-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Stakeholders Directory</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
              Manage your organizational ecosystem: define stakeholder companies (internal
              departments &amp; external partners) and register contact rosters.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setShowCreate(true); setSelected(null); }}>
            <Plus className="h-3.5 w-3.5" />
            Add Stakeholder Company
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Stakeholder Companies" value={total} icon={Building2}
          subtitle={`${internalCount} Int / ${externalCount} Ext`}
        />
        <KPICard
          label="Total Registered Personnel" value={staff.length} icon={UsersRound}
          iconBg="bg-emerald-50" iconColor="text-emerald-600" subtitle="across all rosters"
        />
        <KPICard
          label="Active Projects Cover" value={activeProjectsCover} icon={FolderKanban}
          iconBg="bg-blue-50" iconColor="text-blue-600" subtitle="projects integrated"
        />
        <KPICard
          label="External Partner Ratio" value={`${externalRatio}%`} icon={PieChart}
          iconBg="bg-amber-50" iconColor="text-amber-600" subtitle="external synergy"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, industry type, personnel…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">All Types (Client, Contractor, Engineer)</option>
          {typeOptions.map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => { setSearch(""); setTypeFilter(""); setCategoryFilter("all"); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5">
          {(["all", "internal", "external"] as CategoryFilter[]).map((c) => {
            const count = c === "all" ? total : c === "internal" ? internalCount : externalCount;
            return (
              <button
                key={c}
                onClick={() => { setCategoryFilter(c); setTypeFilter(""); }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  categoryFilter === c
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {c} <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <Building2 className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium">No stakeholder companies found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasActiveFilters ? "Try adjusting your filters." : "Add your first stakeholder company to get started."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <StakeholderCompanyCard
              key={s.id}
              stakeholder={s}
              staff={staffByStakeholder[s.id] ?? []}
              assignedProjectIds={linksByStakeholder[s.id] ?? []}
              trend={trendByStakeholder[s.id] ?? { labels: months.map((m) => m.label), values: [0, 0, 0] }}
              selectedProjectId={selectedProjectId}
              selectedProjectName={selectedProject?.project_name ?? null}
              busy={busyId === s.id}
              onEdit={() => { setSelected(s); setShowCreate(false); }}
              onDelete={() => handleDelete(s)}
              onConnect={() => handleConnect(s)}
              onDisconnect={() => handleDisconnect(s)}
              onBulkAssign={() => setBulkTarget(s)}
              onStaffChange={() => loadData()}
            />
          ))}
        </div>
      )}

      {/* Edit / create slide-over */}
      {(showCreate || selected) && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => { setSelected(null); setShowCreate(false); }}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-xl flex-col bg-background shadow-2xl">
            <StakeholderEditSheet
              key={showCreate ? `create-${categoryFilter}` : selected?.id}
              stakeholder={showCreate ? null : selected}
              defaultCategory={categoryFilter === "internal" ? "internal" : "external"}
              onClose={() => { setSelected(null); setShowCreate(false); }}
              onSave={handleSave}
              onDelete={handleDelete}
              isAdmin={isAdmin}
              onStaffChange={() => loadData()}
            />
          </div>
        </>
      )}

      {/* Bulk HR assign */}
      {bulkTarget && (
        <BulkHrAssignDialog
          stakeholder={bulkTarget}
          projectId={selectedProjectId}
          projectName={selectedProject?.project_name ?? null}
          onClose={() => setBulkTarget(null)}
          onDone={() => { setBulkTarget(null); loadData(); }}
        />
      )}
    </div>
  );
}
