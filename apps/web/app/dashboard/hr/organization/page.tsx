"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsLeft,
  ChevronsUpDown,
  ChevronsRight,
  Loader2,
  Minus,
  Plus,
  Save,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listDepartments, listPositions, listProfilesOrderedByFullName, listTeams, updateProfileById } from "@/lib/hr/hr-queries";
import { cn } from "@/lib/utils";

type EmployeeStatus = "active" | "inactive" | "resigned";

interface EmployeeProfile {
  id: string;
  employee_id: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  department: string | null;
  team_id: string | null;
  position_id: string | null;
  job_title: string | null;
  grade: string | null;
  level: string | null;
  report_to: string | null;
  status: EmployeeStatus;
}

interface Department {
  id: string;
  department_name: string;
}

interface Team {
  id: string;
  team_name: string;
  department_id: string;
}

interface Position {
  id: string;
  position_name: string;
  department_id: string;
  grade: string | null;
}

interface OrgNode {
  profile: EmployeeProfile;
  children: OrgNode[];
}

interface OrgTree {
  roots: OrgNode[];
  childrenByManager: Map<string, EmployeeProfile[]>;
  cyclicIds: Set<string>;
  missingManagerIds: Set<string>;
}

const STATUS_OPTIONS: EmployeeStatus[] = ["active", "inactive", "resigned"];
const STATUS_CLASSES: Record<EmployeeStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactive: "border-amber-200 bg-amber-50 text-amber-700",
  resigned: "border-slate-200 bg-slate-100 text-slate-600",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "EM";
}

function labelize(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildOrgTree(profiles: EmployeeProfile[]): OrgTree {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const cyclicIds = new Set<string>();
  const missingManagerIds = new Set<string>();

  for (const profile of profiles) {
    const seen = new Set<string>();
    let cursor: EmployeeProfile | undefined = profile;

    while (cursor?.report_to) {
      if (seen.has(cursor.id)) {
        seen.forEach((id) => cyclicIds.add(id));
        break;
      }
      seen.add(cursor.id);
      cursor = profileMap.get(cursor.report_to);
      if (!cursor) break;
    }

    if (profile.report_to && !profileMap.has(profile.report_to)) {
      missingManagerIds.add(profile.id);
    }
  }

  const childrenByManager = new Map<string, EmployeeProfile[]>();
  const roots: EmployeeProfile[] = [];

  for (const profile of profiles) {
    const managerId = profile.report_to;
    if (!managerId || !profileMap.has(managerId) || cyclicIds.has(profile.id) || cyclicIds.has(managerId)) {
      roots.push(profile);
      continue;
    }
    const siblings = childrenByManager.get(managerId) ?? [];
    siblings.push(profile);
    childrenByManager.set(managerId, siblings);
  }

  const sortProfiles = (rows: EmployeeProfile[]) =>
    [...rows].sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.full_name.localeCompare(b.full_name);
    });

  function buildNode(profile: EmployeeProfile): OrgNode {
    return {
      profile,
      children: sortProfiles(childrenByManager.get(profile.id) ?? []).map(buildNode),
    };
  }

  return {
    roots: sortProfiles(roots).map(buildNode),
    childrenByManager,
    cyclicIds,
    missingManagerIds,
  };
}

function flattenNodes(nodes: OrgNode[]) {
  const rows: EmployeeProfile[] = [];
  function visit(node: OrgNode) {
    rows.push(node.profile);
    node.children.forEach(visit);
  }
  nodes.forEach(visit);
  return rows;
}

export default function OrganizationPage() {
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [managerDraft, setManagerDraft] = useState("");
  const [zoom, setZoom] = useState(0.95);
  const [detailCollapsed, setDetailCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      const [profileRes, departmentRes, teamRes, positionRes] = await Promise.all([
        listProfilesOrderedByFullName("id, employee_id, full_name, email, avatar_url, department, team_id, position_id, job_title, grade, level, report_to, status"),
        listDepartments(),
        listTeams(),
        listPositions(),
      ]);

      if (cancelled) return;

      const firstError = profileRes.error ?? departmentRes.error ?? teamRes.error ?? positionRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      const nextProfiles = (profileRes.data ?? []) as EmployeeProfile[];
      setProfiles(nextProfiles);
      setDepartments((departmentRes.data ?? []) as Department[]);
      setTeams((teamRes.data ?? []) as Team[]);
      setPositions((positionRes.data ?? []) as Position[]);
      setExpandedIds(new Set(nextProfiles.map((profile) => profile.id)));
      setSelectedId(nextProfiles[0]?.id ?? null);
      setManagerDraft(nextProfiles[0]?.report_to ?? "");
      setLoading(false);
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const teamMap = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const positionMap = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const orgTree = useMemo(() => buildOrgTree(profiles), [profiles]);
  const allTreeProfiles = useMemo(() => flattenNodes(orgTree.roots), [orgTree.roots]);
  const selected = selectedId ? profileMap.get(selectedId) ?? null : null;

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    departments.forEach((department) => names.add(department.department_name));
    profiles.forEach((profile) => {
      if (profile.department) names.add(profile.department);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [departments, profiles]);

  const matchingIds = useMemo(() => {
    const query = search.trim().toLowerCase();
    const ids = new Set<string>();

    for (const profile of profiles) {
      const teamName = profile.team_id ? teamMap.get(profile.team_id)?.team_name ?? "" : "";
      const positionName = profile.position_id ? positionMap.get(profile.position_id)?.position_name ?? "" : "";
      const managerName = profile.report_to ? profileMap.get(profile.report_to)?.full_name ?? "" : "";
      const searchable = [
        profile.employee_id,
        profile.full_name,
        profile.email,
        profile.department,
        profile.job_title,
        teamName,
        positionName,
        managerName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !searchable.includes(query)) continue;
      if (departmentFilter && profile.department !== departmentFilter) continue;
      if (statusFilter && profile.status !== statusFilter) continue;
      ids.add(profile.id);
    }

    if (!query && !departmentFilter && !statusFilter) {
      profiles.forEach((profile) => ids.add(profile.id));
    }

    for (const id of [...ids]) {
      let cursor = profileMap.get(id);
      const seen = new Set<string>();
      while (cursor?.report_to && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        const parent = profileMap.get(cursor.report_to);
        if (!parent) break;
        ids.add(parent.id);
        cursor = parent;
      }
    }

    return ids;
  }, [departmentFilter, positionMap, profileMap, profiles, search, statusFilter, teamMap]);

  const stats = useMemo(() => {
    const active = profiles.filter((profile) => profile.status === "active").length;
    return {
      departments: departments.length,
      teams: teams.length,
      positions: positions.length,
      active,
      roots: orgTree.roots.length,
      warnings: orgTree.missingManagerIds.size + orgTree.cyclicIds.size,
    };
  }, [departments.length, orgTree.cyclicIds.size, orgTree.missingManagerIds.size, orgTree.roots.length, positions.length, profiles, teams.length]);

  const directReports = selected ? orgTree.childrenByManager.get(selected.id) ?? [] : [];
  const descendantIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const ids = new Set<string>();
    const stack = [...(orgTree.childrenByManager.get(selected.id) ?? [])];
    while (stack.length > 0) {
      const profile = stack.pop();
      if (!profile || ids.has(profile.id)) continue;
      ids.add(profile.id);
      stack.push(...(orgTree.childrenByManager.get(profile.id) ?? []));
    }
    return ids;
  }, [orgTree.childrenByManager, selected]);

  const managerCandidates = useMemo(() => {
    if (!selected) return [];
    return profiles
      .filter((profile) => profile.id !== selected.id && !descendantIds.has(profile.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [descendantIds, profiles, selected]);

  function toggleNode(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedIds(new Set(profiles.map((profile) => profile.id)));
  }

  function collapseAll() {
    const rootIds = orgTree.roots.map((node) => node.profile.id);
    setExpandedIds(new Set(rootIds));
  }

  async function saveManager() {
    if (!selected) return;
    if (managerDraft && (managerDraft === selected.id || descendantIds.has(managerDraft))) {
      toast.error("Manager cannot be the employee or one of their direct reports.");
      return;
    }

    setSaving(true);
    const nextManager = managerDraft || null;
    const { error: updateError } = await updateProfileById({ report_to: nextManager }, selected.id);

    if (updateError) {
      toast.error(updateError.message);
      setSaving(false);
      return;
    }

    setProfiles((current) => current.map((profile) => (profile.id === selected.id ? { ...profile, report_to: nextManager } : profile)));
    toast.success("Reporting line updated");
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Organization Setup</h2>
          <p className="text-muted-foreground">Visualize reporting lines from Employee Master and maintain manager assignments</p>
        </div>
        <Button className="gap-2" disabled title="Department setup CRUD will be added in a later release">
          <Plus className="h-4 w-4" />
          Add Department
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Departments" value={stats.departments} icon={Building2} />
        <SummaryCard title="Teams" value={stats.teams} icon={Users} />
        <SummaryCard title="Positions" value={stats.positions} icon={Users} />
        <SummaryCard title="Active Employees" value={stats.active} icon={Users} tone="success" />
        <SummaryCard title="Top Level" value={stats.roots} icon={ChevronsUpDown} />
        <SummaryCard title="Warnings" value={stats.warnings} icon={AlertTriangle} tone="warning" />
      </div>

      <div className={cn("grid gap-4", detailCollapsed ? "xl:grid-cols-[minmax(0,1fr)_88px]" : "xl:grid-cols-[minmax(0,1fr)_360px]")}>
        <Card className="min-w-0">
          <CardHeader className="gap-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Organization Chart</CardTitle>
                <CardDescription>Employee reporting hierarchy based on Employee Master manager assignments</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={expandAll} className="gap-2">
                  <ChevronsUpDown className="h-4 w-4" />
                  Expand
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll} className="gap-2">
                  <ChevronsDownUp className="h-4 w-4" />
                  Collapse
                </Button>
                <Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))} aria-label="Zoom out">
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
                <Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.min(1.25, value + 0.1))} aria-label="Zoom in">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_200px_160px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search employee, ID, manager..."
                  className="pl-9"
                />
              </div>
              <NativeSelect value={departmentFilter} onChange={setDepartmentFilter} placeholder="All departments">
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {labelize(department)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={statusFilter} onChange={setStatusFilter} placeholder="All status">
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {labelize(status)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
            ) : loading ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed py-20 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading organization chart...
              </div>
            ) : profiles.length === 0 ? (
              <div className="rounded-lg border border-dashed py-20 text-center text-muted-foreground">No employees found.</div>
            ) : (
              <>
                {stats.warnings > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {orgTree.missingManagerIds.size > 0 && <span>{orgTree.missingManagerIds.size} employee(s) reference a missing manager. </span>}
                    {orgTree.cyclicIds.size > 0 && <span>{orgTree.cyclicIds.size} employee(s) are in circular reporting lines.</span>}
                  </div>
                )}
                <div className="overflow-auto rounded-lg border border-border bg-muted/20 p-4">
                  <div className="min-w-max origin-top-left transition-transform" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
                    <div className="flex flex-col items-center gap-8 pb-8 pr-8">
                      {orgTree.roots.map((node) => (
                        <OrgTreeNode
                          key={node.profile.id}
                          node={node}
                          level={0}
                          selectedId={selectedId}
                          expandedIds={expandedIds}
                          visibleIds={matchingIds}
                          teamMap={teamMap}
                          positionMap={positionMap}
                          missingManagerIds={orgTree.missingManagerIds}
                          cyclicIds={orgTree.cyclicIds}
                          onSelect={(profile) => {
                            setSelectedId(profile.id);
                            setManagerDraft(profile.report_to ?? "");
                          }}
                          onToggle={toggleNode}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Showing {matchingIds.size} of {allTreeProfiles.length} employees. Filters keep matching employees and their manager path visible.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <EmployeePanel
          selected={selected}
          directReports={directReports}
          managerDraft={managerDraft}
          managerCandidates={managerCandidates}
          profileMap={profileMap}
          teamMap={teamMap}
          positionMap={positionMap}
          missingManagerIds={orgTree.missingManagerIds}
          cyclicIds={orgTree.cyclicIds}
          saving={saving}
          collapsed={detailCollapsed}
          onToggleCollapsed={() => setDetailCollapsed((current) => !current)}
          onManagerChange={setManagerDraft}
          onSave={saveManager}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: number;
  icon: typeof Users;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass = tone === "success" ? "text-emerald-600" : tone === "warning" ? "text-amber-600" : "text-primary";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", toneClass)} />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function OrgTreeNode({
  node,
  level,
  selectedId,
  expandedIds,
  visibleIds,
  teamMap,
  positionMap,
  missingManagerIds,
  cyclicIds,
  onSelect,
  onToggle,
}: {
  node: OrgNode;
  level: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  visibleIds: Set<string>;
  teamMap: Map<string, Team>;
  positionMap: Map<string, Position>;
  missingManagerIds: Set<string>;
  cyclicIds: Set<string>;
  onSelect: (profile: EmployeeProfile) => void;
  onToggle: (id: string) => void;
}) {
  const visibleChildren = node.children.filter((child) => visibleIds.has(child.profile.id));
  const isExpanded = expandedIds.has(node.profile.id);
  const hasChildren = visibleChildren.length > 0;

  if (!visibleIds.has(node.profile.id) && visibleChildren.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      <EmployeeNodeCard
        profile={node.profile}
        selected={node.profile.id === selectedId}
        level={level}
        teamName={node.profile.team_id ? teamMap.get(node.profile.team_id)?.team_name ?? null : null}
        positionName={node.profile.position_id ? positionMap.get(node.profile.position_id)?.position_name ?? null : null}
        reportCount={node.children.length}
        warning={missingManagerIds.has(node.profile.id) || cyclicIds.has(node.profile.id)}
        onSelect={() => onSelect(node.profile)}
      />

      {hasChildren && (
        <button
          type="button"
          onClick={() => onToggle(node.profile.id)}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm hover:bg-muted"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {visibleChildren.length}
        </button>
      )}

      {hasChildren && isExpanded && (
        <>
          <div className="h-5 w-px bg-border" />
          <div className="flex gap-5">
            {visibleChildren.map((child) => (
              <div key={child.profile.id} className="relative flex flex-col items-center">
                <div className="absolute -top-0 h-px w-full bg-border" />
                <OrgTreeNode
                  node={child}
                  level={level + 1}
                  selectedId={selectedId}
                  expandedIds={expandedIds}
                  visibleIds={visibleIds}
                  teamMap={teamMap}
                  positionMap={positionMap}
                  missingManagerIds={missingManagerIds}
                  cyclicIds={cyclicIds}
                  onSelect={onSelect}
                  onToggle={onToggle}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmployeeNodeCard({
  profile,
  selected,
  level,
  teamName,
  positionName,
  reportCount,
  warning,
  onSelect,
}: {
  profile: EmployeeProfile;
  selected: boolean;
  level: number;
  teamName: string | null;
  positionName: string | null;
  reportCount: number;
  warning: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-64 rounded-lg border bg-background p-3 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md",
        selected && "border-primary ring-2 ring-primary/20",
        warning && "border-amber-300 bg-amber-50/70",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name} />
          <AvatarFallback>{initials(profile.full_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium">{profile.full_name}</p>
            {warning && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
          </div>
          <p className="truncate text-xs text-muted-foreground">{profile.employee_id ?? "-"}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <p className="truncate text-sm">{positionName ?? profile.job_title ?? "-"}</p>
        <p className="truncate text-xs text-muted-foreground">{labelize(profile.department)} · {teamName ?? "-"}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Badge variant="outline" className={cn("capitalize", STATUS_CLASSES[profile.status])}>{profile.status}</Badge>
        <span className="text-xs text-muted-foreground">L{level + 1} · {reportCount} reports</span>
      </div>
    </button>
  );
}

function EmployeePanel({
  selected,
  directReports,
  managerDraft,
  managerCandidates,
  profileMap,
  teamMap,
  positionMap,
  missingManagerIds,
  cyclicIds,
  saving,
  collapsed,
  onToggleCollapsed,
  onManagerChange,
  onSave,
}: {
  selected: EmployeeProfile | null;
  directReports: EmployeeProfile[];
  managerDraft: string;
  managerCandidates: EmployeeProfile[];
  profileMap: Map<string, EmployeeProfile>;
  teamMap: Map<string, Team>;
  positionMap: Map<string, Position>;
  missingManagerIds: Set<string>;
  cyclicIds: Set<string>;
  saving: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onManagerChange: (value: string) => void;
  onSave: () => void;
}) {
  if (!selected) {
    return (
      <Card className="xl:sticky xl:top-6 xl:self-start">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>Employee Details</CardTitle>
            <CardDescription>Select a chart node to view details and edit reporting line</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand employee details" : "Collapse employee details"}
          >
            {collapsed ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">No employee selected.</div>
        </CardContent>
      </Card>
    );
  }

  const manager = selected.report_to ? profileMap.get(selected.report_to) ?? null : null;
  const teamName = selected.team_id ? teamMap.get(selected.team_id)?.team_name ?? null : null;
  const positionName = selected.position_id ? positionMap.get(selected.position_id)?.position_name ?? null : null;
  const hasWarning = missingManagerIds.has(selected.id) || cyclicIds.has(selected.id);

  if (collapsed) {
    return (
      <Card className="xl:sticky xl:top-6 xl:self-start">
        <CardHeader className="flex items-center justify-center p-3">
          <Button variant="ghost" size="icon" onClick={onToggleCollapsed} aria-label="Expand employee details">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 px-3 pb-3 pt-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={selected.avatar_url ?? undefined} alt={selected.full_name} />
            <AvatarFallback>{initials(selected.full_name)}</AvatarFallback>
          </Avatar>
          <div className="w-full space-y-1 text-center">
            <p className="truncate text-sm font-semibold">{selected.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{selected.employee_id ?? "-"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onToggleCollapsed} className="w-full gap-2">
            <ChevronsLeft className="h-4 w-4" />
            Open
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="xl:sticky xl:top-6 xl:self-start">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Employee Details</CardTitle>
          <CardDescription>Quick manager edit writes back to Employee Master</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleCollapsed} aria-label="Collapse employee details">
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={selected.avatar_url ?? undefined} alt={selected.full_name} />
            <AvatarFallback>{initials(selected.full_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{selected.full_name}</h3>
            <p className="truncate text-sm text-muted-foreground">{selected.employee_id ?? "-"} · {selected.email}</p>
          </div>
        </div>

        {hasWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This employee has a reporting-line warning. Choose a valid manager to repair it.
          </div>
        )}

        <div className="grid gap-3 text-sm">
          <DetailRow label="Current Manager" value={manager?.full_name ?? (selected.report_to ? "Missing manager" : "Top level")} />
          <DetailRow label="Department" value={labelize(selected.department)} />
          <DetailRow label="Team" value={teamName ?? "-"} />
          <DetailRow label="Position" value={positionName ?? selected.job_title ?? "-"} />
          <DetailRow label="Grade / Level" value={selected.grade || selected.level || "-"} />
          <DetailRow label="Direct Reports" value={`${directReports.length}`} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="manager">Manager</Label>
          <NativeSelect value={managerDraft} onChange={onManagerChange} placeholder="Top level">
            {managerCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.full_name}{candidate.employee_id ? ` (${candidate.employee_id})` : ""}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={onSave} disabled={saving || managerDraft === (selected.report_to ?? "")} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Reporting Line
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Direct Reports</p>
          {directReports.length === 0 ? (
            <p className="rounded-md bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">No direct reports.</p>
          ) : (
            <div className="space-y-2">
              {directReports.map((profile) => (
                <div key={profile.id} className="rounded-md border border-border px-3 py-2">
                  <p className="truncate text-sm font-medium">{profile.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{profile.employee_id ?? "-"} · {profile.job_title ?? "-"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
}
