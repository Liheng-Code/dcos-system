"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlModelFormDialog } from "@/components/qs/dwl-model-form-dialog";
import { DwlModelFactorFormDialog } from "@/components/qs/dwl-model-factor-form-dialog";
import { DwlProjectFormDialog } from "@/components/qs/dwl-project-form-dialog";
import { DwlSnapshotDialog } from "@/components/qs/dwl-snapshot-dialog";
import {
  DWL_DEFAULT_MARKUPS,
  DWL_MARKUP_LABELS,
} from "@/components/qs/dwl-types";
import type {
  DwlMarkupInputs,
  DwlModelFactor,
  DwlModelFactorRow,
  DwlProject,
  DwlProjectEstimateRow,
  DwlProjectSnapshot,
  DwlQuantityModel,
  DwlQuantityModelRow,
  DwlSnapshotPayload,
} from "@/components/qs/dwl-types";
import { deleteDwlModelFactorById, getProfileById, listDwlModelFactors, listDwlModelFactorsByModelId, listDwlProjectSnapshotsByProjectId, listDwlProjects, listDwlQuantityModels, listDwlVAssemblyRatesByAssemblyIds, listDwlVProjectEstimateByProjectId, updateDwlProjectById } from "@/lib/qs/qs-queries";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export default function DwlEstimateListPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantLoaded, setTenantLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<"models" | "projects">("models");

  // ── Quantity Models ──────────────────────────────────────────────────
  const [modelRows, setModelRows] = useState<DwlQuantityModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");

  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [factorLines, setFactorLines] = useState<DwlModelFactorRow[]>([]);
  const [factorLoading, setFactorLoading] = useState(false);
  const [factorNote, setFactorNote] = useState<string | null>(null);

  const [showModelForm, setShowModelForm] = useState(false);
  const [showFactorForm, setShowFactorForm] = useState(false);
  const [editingFactor, setEditingFactor] = useState<DwlModelFactor | null>(null);
  const [deletingFactorId, setDeletingFactorId] = useState<string | null>(null);

  // ── Quick Estimate Projects ──────────────────────────────────────────
  const [projects, setProjects] = useState<DwlProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [estimateRows, setEstimateRows] = useState<DwlProjectEstimateRow[]>([]);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [gfaInput, setGfaInput] = useState("");
  const [footprintInput, setFootprintInput] = useState("");
  const [storeysInput, setStoreysInput] = useState("");
  const [savingParams, setSavingParams] = useState(false);

  const [markups, setMarkups] = useState<DwlMarkupInputs>(DWL_DEFAULT_MARKUPS);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);

  const [snapshots, setSnapshots] = useState<DwlProjectSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);

  // ── Tenant / user ─────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setTenantLoaded(true);
        return;
      }
      const { data: profile, error } = await getProfileById(uid, "company_id");
      if (!error && profile?.company_id) setTenantId(profile.company_id as string);
      setTenantLoaded(true);
    });
  }, [supabase]);

  // ── Load models ───────────────────────────────────────────────────────
  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    const [modelResult, factorResult] = await Promise.all([
      listDwlQuantityModels(),
      listDwlModelFactors(),
    ]);

    if (modelResult.error) {
      setModelsError(modelResult.error.message);
      setModelsLoading(false);
      return;
    }

    const countByModel = new Map<string, number>();
    for (const f of (factorResult.data ?? []) as { model_id: string }[]) {
      countByModel.set(f.model_id, (countByModel.get(f.model_id) ?? 0) + 1);
    }

    const merged: DwlQuantityModelRow[] = (modelResult.data ?? []).map((m) => ({
      model: m as DwlQuantityModel,
      factorCount: countByModel.get((m as DwlQuantityModel).id) ?? 0,
    }));
    setModelRows(merged);
    setModelsLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadModels(); }, [loadModels]);

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return modelRows;
    const q = modelSearch.trim().toLowerCase();
    return modelRows.filter(
      (r) =>
        r.model.code.toLowerCase().includes(q) ||
        r.model.building_type.toLowerCase().includes(q) ||
        r.model.description.toLowerCase().includes(q)
    );
  }, [modelRows, modelSearch]);

  const selectedModelRow = useMemo(
    () => modelRows.find((r) => r.model.id === selectedModelId) ?? null,
    [modelRows, selectedModelId]
  );

  const loadFactors = useCallback(
    async (model: DwlQuantityModel) => {
      setFactorLoading(true);
      setFactorNote(null);

      const factorResult = await listDwlModelFactorsByModelId(model.id);

      if (factorResult.error) {
        setFactorNote(factorResult.error.message);
        setFactorLoading(false);
        return;
      }

      type RawFactor = DwlModelFactor & {
        dwl_assemblies: { code: string; element_group: string; description: string; unit: string };
      };
      const rawFactors = (factorResult.data ?? []) as unknown as RawFactor[];
      const assemblyIds = rawFactors.map((r) => r.assembly_id);

      const rateResult = assemblyIds.length
        ? await listDwlVAssemblyRatesByAssemblyIds(assemblyIds)
        : { data: [], error: null };

      if (rateResult.error) {
        setFactorNote(rateResult.error.message);
        setFactorLoading(false);
        return;
      }

      const rateByAssembly = new Map<string, { net_direct_rate: number; has_expired_price: boolean }>();
      for (const r of (rateResult.data ?? []) as { assembly_id: string; net_direct_rate: number; has_expired_price: boolean }[]) {
        rateByAssembly.set(r.assembly_id, r);
      }

      const merged: DwlModelFactorRow[] = rawFactors.map((row) => {
        const rate = rateByAssembly.get(row.assembly_id);
        return {
          factor: {
            id: row.id,
            tenant_id: row.tenant_id,
            model_id: row.model_id,
            assembly_id: row.assembly_id,
            driver: row.driver,
            factor: row.factor,
            basis_note: row.basis_note,
          },
          assembly: {
            code: row.dwl_assemblies.code,
            element_group: row.dwl_assemblies.element_group,
            description: row.dwl_assemblies.description,
            unit: row.dwl_assemblies.unit,
            net_direct_rate: rate?.net_direct_rate ?? null,
            has_expired_price: rate?.has_expired_price ?? false,
          },
        };
      });

      setFactorLines(merged);
      setFactorLoading(false);

      const unpriced = merged.filter((l) => l.assembly.net_direct_rate === null).length;
      if (unpriced > 0) {
        setFactorNote(
          `${unpriced} factor(s) reference an assembly with no computed rate (no item lines yet) and are excluded from the project estimate.`
        );
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (selectedModelRow) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadFactors(selectedModelRow.model);
    } else {
      setFactorLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelRow?.model.id]);

  async function handleDeleteFactor(row: DwlModelFactorRow) {
    if (!confirm(`Remove the factor for ${row.assembly.code}?`)) return;
    setDeletingFactorId(row.factor.id);
    const { error } = await deleteDwlModelFactorById(row.factor.id);
    setDeletingFactorId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Factor removed");
    if (selectedModelRow) void loadFactors(selectedModelRow.model);
    void loadModels();
  }

  const editingFactorAssembly = useMemo(() => {
    if (!editingFactor) return null;
    const row = factorLines.find((l) => l.factor.id === editingFactor.id);
    return row ? { code: row.assembly.code, description: row.assembly.description, unit: row.assembly.unit } : null;
  }, [editingFactor, factorLines]);

  // ── Load projects ─────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    const { data, error } = await listDwlProjects();
    if (error) {
      setProjectsError(error.message);
      setProjectsLoading(false);
      return;
    }
    setProjects((data ?? []) as DwlProject[]);
    setProjectsLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.trim().toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedProjectModel = useMemo(
    () => modelRows.find((r) => r.model.id === selectedProject?.model_id)?.model ?? null,
    [modelRows, selectedProject]
  );

  const loadEstimate = useCallback(
    async (project: DwlProject) => {
      setEstimateLoading(true);
      setEstimateError(null);
      const { data, error } = await listDwlVProjectEstimateByProjectId(project.id);
      if (error) {
        setEstimateError(error.message);
        setEstimateLoading(false);
        return;
      }
      setEstimateRows((data ?? []) as DwlProjectEstimateRow[]);
      setEstimateLoading(false);
    },
    [supabase]
  );

  const loadSnapshots = useCallback(
    async (project: DwlProject) => {
      setSnapshotsLoading(true);
      const { data, error } = await listDwlProjectSnapshotsByProjectId(project.id);
      if (!error && data) setSnapshots(data as unknown as DwlProjectSnapshot[]);
      setSnapshotsLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    if (selectedProject) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGfaInput(selectedProject.gfa !== null ? String(selectedProject.gfa) : "");
      setFootprintInput(selectedProject.footprint !== null ? String(selectedProject.footprint) : "");
      setStoreysInput(selectedProject.storeys !== null ? String(selectedProject.storeys) : "");
      setMarkups(DWL_DEFAULT_MARKUPS);
      setExpandedSnapshotId(null);
      void loadEstimate(selectedProject);
      void loadSnapshots(selectedProject);
    } else {
      setEstimateRows([]);
      setSnapshots([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]);

  async function handleSaveParams() {
    if (!selectedProject) return;
    if (!gfaInput.trim()) {
      toast.error("GFA is required");
      return;
    }
    setSavingParams(true);
    const { error } = await updateDwlProjectById({
        gfa: Number(gfaInput),
        footprint: footprintInput.trim() ? Number(footprintInput) : null,
        storeys: storeysInput.trim() ? Number(storeysInput) : null,
      }, selectedProject.id);
    setSavingParams(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Parameters updated — estimate recalculated");
    await loadProjects();
    void loadEstimate(selectedProject);
  }

  const groupedEstimate = useMemo(() => {
    const groups = new Map<string, DwlProjectEstimateRow[]>();
    for (const row of estimateRows) {
      const list = groups.get(row.element_group) ?? [];
      list.push(row);
      groups.set(row.element_group, list);
    }
    return Array.from(groups.entries()).map(([group, rows]) => ({
      group,
      rows,
      subtotal: rows.reduce((sum, r) => sum + r.amount, 0),
    }));
  }, [estimateRows]);

  const directCost = useMemo(() => estimateRows.reduce((sum, r) => sum + r.amount, 0), [estimateRows]);

  const markupAmount = useMemo(
    () =>
      DWL_MARKUP_LABELS.reduce((sum, { key }) => sum + (directCost * markups[key]) / 100, 0),
    [directCost, markups]
  );

  const totalEstimate = directCost + markupAmount;

  const snapshotPayload: DwlSnapshotPayload | null = useMemo(() => {
    if (!selectedProject) return null;
    return {
      project: {
        name: selectedProject.name,
        model_code: selectedProjectModel?.code ?? null,
        gfa: selectedProject.gfa,
        footprint: selectedProject.footprint,
        storeys: selectedProject.storeys,
      },
      estimate_rows: estimateRows,
      direct_cost: directCost,
      markups,
      markup_amount: markupAmount,
      total: totalEstimate,
    };
  }, [selectedProject, selectedProjectModel, estimateRows, directCost, markups, markupAmount, totalEstimate]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");
  // NOTE: gated on can_create, not "submit". The qs_libraries permission
  // matrix currently has submit=false for every role including QS Manager,
  // L0, L1, L2 (verified live) — gating this on "submit" would make Issue
  // Snapshot permanently unreachable for everyone. Using can_create matches
  // how the other Level 1-3 write actions in this module are gated. Flagged
  // as an open RBAC question: a future permission seed may want a dedicated
  // submit grant for a QS Manager sign-off step before a snapshot is issued.
  const canIssueSnapshot = canCreate;

  const activeModels = useMemo(() => modelRows.filter((r) => r.model.is_active).map((r) => r.model), [modelRows]);

  if (permsLoaded && !canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">You do not have permission to view the Direct Works Cost Library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Direct Works Cost Library — Quick Estimate</h1>
          <p className="text-sm text-muted-foreground">
            Level 4: pick a parametric model, enter building parameters, view the live elemental
            estimate, apply markups, and issue a permanent snapshot before tender submission.
          </p>
        </div>
        {activeTab === "models" ? (
          <Button
            onClick={() => setShowModelForm(true)}
            size="sm"
            disabled={!tenantLoaded || !tenantId || !canCreate}
            title={!canCreate ? "You do not have permission to add quantity models" : undefined}
          >
            <Plus className="h-4 w-4" /> Add Model
          </Button>
        ) : (
          <Button
            onClick={() => setShowProjectForm(true)}
            size="sm"
            disabled={!tenantLoaded || !tenantId || !canCreate}
            title={!canCreate ? "You do not have permission to add projects" : undefined}
          >
            <Plus className="h-4 w-4" /> New Project
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "models" | "projects")}>
        <TabsList>
          <TabsTrigger value="models">Quantity Models</TabsTrigger>
          <TabsTrigger value="projects">Quick Estimate Projects</TabsTrigger>
        </TabsList>

        {/* ───────────────────────── Models tab ───────────────────────── */}
        <TabsContent value="models">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="flex flex-col gap-3 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="Search code, type, description…"
                    className="pl-8"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadModels()} disabled={modelsLoading}>
                  <RefreshCw className={cn("h-3.5 w-3.5", modelsLoading && "animate-spin")} />
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">{filteredModels.length} models</span>
              </div>

              {modelsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : modelsError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
                  <AlertTriangle className="h-8 w-8 text-destructive/60" />
                  <p className="text-sm text-muted-foreground">Failed to load models: {modelsError}</p>
                  <Button size="sm" variant="outline" onClick={() => void loadModels()}>
                    Retry
                  </Button>
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <Ruler className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {modelRows.length === 0
                      ? "No parametric quantity models yet — this level is not populated yet."
                      : "No models match your search."}
                  </p>
                  {modelRows.length === 0 && canCreate && (
                    <Button size="sm" onClick={() => setShowModelForm(true)} disabled={!tenantId}>
                      <Plus className="h-4 w-4" /> Add the first model
                    </Button>
                  )}
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="w-32">Code</TableHead>
                        <TableHead>Type / Description</TableHead>
                        <TableHead className="w-16 text-right">Factors</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredModels.map((row) => (
                        <TableRow
                          key={row.model.id}
                          onClick={() => setSelectedModelId(row.model.id)}
                          className={cn("cursor-pointer", selectedModelId === row.model.id && "bg-muted/50")}
                        >
                          <TableCell className="font-mono text-xs font-medium">{row.model.code}</TableCell>
                          <TableCell className="text-xs">
                            <div className="line-clamp-2">{row.model.description}</div>
                            <span className="text-[10px] text-muted-foreground">{row.model.building_type}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{row.factorCount}</TableCell>
                          <TableCell>{!row.model.is_active && <Badge variant="outline">Inactive</Badge>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="lg:col-span-3">
              {!selectedModelRow ? (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <Ruler className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Select a model on the left to view or edit its factor lines.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{selectedModelRow.model.code}</span>
                        <Badge variant="outline">{selectedModelRow.model.building_type}</Badge>
                        {!selectedModelRow.model.is_active && <Badge variant="outline">Inactive</Badge>}
                      </div>
                      <p className="mt-1 text-sm">{selectedModelRow.model.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Basis: {selectedModelRow.model.basis_note}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Factor lines (per-assembly quantity ratios)</p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!tenantId || !canCreate}
                      title={!canCreate ? "You do not have permission to add factors" : undefined}
                      onClick={() => {
                        setEditingFactor(null);
                        setShowFactorForm(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Factor
                    </Button>
                  </div>

                  {factorLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : factorLines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
                      <p className="text-sm text-muted-foreground">No factor lines yet — this model cannot drive an estimate.</p>
                      {canCreate && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingFactor(null);
                            setShowFactorForm(true);
                          }}
                        >
                          <Plus className="h-4 w-4" /> Add the first factor
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      {factorNote && (
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                          {factorNote}
                        </p>
                      )}
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-28">Assembly</TableHead>
                              <TableHead>Description / Basis</TableHead>
                              <TableHead className="w-24">Driver</TableHead>
                              <TableHead className="w-20 text-right">Factor</TableHead>
                              <TableHead className="w-24 text-right">Rate</TableHead>
                              <TableHead className="w-24 text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {factorLines.map((line) => (
                              <TableRow key={line.factor.id}>
                                <TableCell className="font-mono text-xs font-medium">
                                  {line.assembly.code}
                                  {line.assembly.has_expired_price && (
                                    <Badge variant="destructive" className="ml-1.5">
                                      Expired
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs">
                                  <div>{line.assembly.description}</div>
                                  <div className="text-[11px] italic text-muted-foreground">{line.factor.basis_note}</div>
                                </TableCell>
                                <TableCell className="text-xs">{line.factor.driver}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{line.factor.factor}</TableCell>
                                <TableCell className="text-right font-mono text-xs">
                                  {line.assembly.net_direct_rate !== null ? formatMoney(line.assembly.net_direct_rate) : "—"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {canEdit && (
                                      <button
                                        onClick={() => {
                                          setEditingFactor(line.factor);
                                          setShowFactorForm(true);
                                        }}
                                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button
                                        onClick={() => void handleDeleteFactor(line)}
                                        disabled={deletingFactorId === line.factor.id}
                                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                      >
                                        {deletingFactorId === line.factor.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ─────────────────────── Projects tab ─────────────────────── */}
        <TabsContent value="projects">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="flex flex-col gap-3 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Search project name…"
                    className="pl-8"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadProjects()} disabled={projectsLoading}>
                  <RefreshCw className={cn("h-3.5 w-3.5", projectsLoading && "animate-spin")} />
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">{filteredProjects.length} projects</span>
              </div>

              {projectsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : projectsError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
                  <AlertTriangle className="h-8 w-8 text-destructive/60" />
                  <p className="text-sm text-muted-foreground">Failed to load projects: {projectsError}</p>
                  <Button size="sm" variant="outline" onClick={() => void loadProjects()}>
                    Retry
                  </Button>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <Calculator className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {projects.length === 0
                      ? "No quick estimate projects yet."
                      : "No projects match your search."}
                  </p>
                  {projects.length === 0 && canCreate && (
                    <Button
                      size="sm"
                      onClick={() => setShowProjectForm(true)}
                      disabled={!tenantId || activeModels.length === 0}
                      title={activeModels.length === 0 ? "Create a quantity model with factors first" : undefined}
                    >
                      <Plus className="h-4 w-4" /> Create the first project
                    </Button>
                  )}
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-20 text-right">GFA</TableHead>
                        <TableHead className="w-20">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProjects.map((p) => (
                        <TableRow
                          key={p.id}
                          onClick={() => setSelectedProjectId(p.id)}
                          className={cn("cursor-pointer", selectedProjectId === p.id && "bg-muted/50")}
                        >
                          <TableCell className="text-xs">
                            <div className="line-clamp-1 font-medium">{p.name}</div>
                            <span className="text-[10px] text-muted-foreground">
                              {modelRows.find((r) => r.model.id === p.model_id)?.model.code ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{p.gfa !== null ? formatNumber(p.gfa) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 lg:col-span-3">
              {!selectedProject ? (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <Calculator className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Select a project on the left to view its estimate.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{selectedProject.name}</span>
                          <Badge variant="outline" className="capitalize">
                            {selectedProject.status}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Model: {selectedProjectModel ? `${selectedProjectModel.code} — ${selectedProjectModel.building_type}` : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">GFA (m²) *</label>
                        <Input value={gfaInput} onChange={(e) => setGfaInput(e.target.value)} inputMode="decimal" disabled={!canEdit} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Footprint (m²)</label>
                        <Input
                          value={footprintInput}
                          onChange={(e) => setFootprintInput(e.target.value)}
                          inputMode="decimal"
                          disabled={!canEdit}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Storeys</label>
                        <Input value={storeysInput} onChange={(e) => setStoreysInput(e.target.value)} inputMode="numeric" disabled={!canEdit} />
                      </div>
                    </div>
                    {canEdit && (
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => void handleSaveParams()} disabled={savingParams}>
                          {savingParams && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Save Parameters
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Elemental estimate (live — recalculates as prices and factors change)</p>
                    {estimateLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    ) : estimateError ? (
                      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-10 text-center">
                        <AlertTriangle className="h-8 w-8 text-destructive/60" />
                        <p className="text-sm text-muted-foreground">Failed to load estimate: {estimateError}</p>
                        <Button size="sm" variant="outline" onClick={() => void loadEstimate(selectedProject)}>
                          Retry
                        </Button>
                      </div>
                    ) : estimateRows.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                        No estimate rows — the selected model has no priced factor lines, or GFA/footprint/storeys is not set.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-28">Assembly</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="w-20 text-right">Qty</TableHead>
                              <TableHead className="w-12">Unit</TableHead>
                              <TableHead className="w-24 text-right">Rate</TableHead>
                              <TableHead className="w-28 text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupedEstimate.map(({ group, rows, subtotal }) => (
                              <Fragment key={group}>
                                <TableRow className="bg-muted/40">
                                  <TableCell colSpan={5} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {group}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs font-semibold">{formatMoney(subtotal)}</TableCell>
                                </TableRow>
                                {rows.map((r) => (
                                  <TableRow key={`${group}-${r.assembly_code}`}>
                                    <TableCell className="font-mono text-xs">{r.assembly_code}</TableCell>
                                    <TableCell className="text-xs">{r.description}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">{formatNumber(r.quantity)}</TableCell>
                                    <TableCell className="text-xs">{r.unit}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">{formatMoney(r.net_direct_rate)}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">{formatMoney(r.amount)}</TableCell>
                                  </TableRow>
                                ))}
                              </Fragment>
                            ))}
                            <TableRow>
                              <TableCell colSpan={5} className="text-right text-xs font-semibold">
                                Direct Cost
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">{formatMoney(directCost)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Markups (applied on top of direct cost — indicative defaults per SOP §10, editable per tender)
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {DWL_MARKUP_LABELS.map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <label className="text-xs text-muted-foreground">{label} (%)</label>
                          <Input
                            value={markups[key]}
                            inputMode="decimal"
                            onChange={(e) => {
                              const v = e.target.value;
                              const num = v === "" ? 0 : Number(v);
                              if (!Number.isNaN(num)) setMarkups((m) => ({ ...m, [key]: num }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Direct cost</span>
                        <span className="font-mono">{formatMoney(directCost)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total markups</span>
                        <span className="font-mono">{formatMoney(markupAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Estimated Total</span>
                        <span className="font-mono">{formatMoney(totalEstimate)}</span>
                      </div>
                    </div>
                    {canIssueSnapshot && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => setShowSnapshotDialog(true)}
                          disabled={estimateRows.length === 0}
                          title={estimateRows.length === 0 ? "No estimate to snapshot" : undefined}
                        >
                          <Lock className="h-3.5 w-3.5" /> Issue Snapshot
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Snapshot history (permanent, read-only once issued)</p>
                    {snapshotsLoading ? (
                      <Skeleton className="h-8 w-full" />
                    ) : snapshots.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                        No snapshots issued yet for this project.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {snapshots.map((s) => {
                          const expanded = expandedSnapshotId === s.id;
                          return (
                            <div key={s.id} className="rounded-lg border border-border">
                              <button
                                type="button"
                                onClick={() => setExpandedSnapshotId(expanded ? null : s.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                              >
                                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                <Lock className="h-3 w-3 text-amber-600" />
                                <span className="font-medium">{s.label}</span>
                                <span className="ml-auto text-muted-foreground">{new Date(s.snapped_at).toLocaleString()}</span>
                                <span className="font-mono font-medium">{formatMoney(s.payload.total)}</span>
                              </button>
                              {expanded && (
                                <div className="border-t border-border px-3 py-2 text-xs">
                                  <div className="mb-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                                    <span>Direct cost: <span className="font-mono text-foreground">{formatMoney(s.payload.direct_cost)}</span></span>
                                    <span>Markups: <span className="font-mono text-foreground">{formatMoney(s.payload.markup_amount)}</span></span>
                                    <span>GFA: <span className="font-mono text-foreground">{s.payload.project.gfa ?? "—"}</span></span>
                                    <span>Model: <span className="font-mono text-foreground">{s.payload.project.model_code ?? "—"}</span></span>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto rounded border border-border/60">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-24">Assembly</TableHead>
                                          <TableHead className="w-16 text-right">Qty</TableHead>
                                          <TableHead className="w-20 text-right">Rate</TableHead>
                                          <TableHead className="w-24 text-right">Amount</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {s.payload.estimate_rows.map((r) => (
                                          <TableRow key={r.assembly_code}>
                                            <TableCell className="font-mono text-[11px]">{r.assembly_code}</TableCell>
                                            <TableCell className="text-right font-mono text-[11px]">{formatNumber(r.quantity)}</TableCell>
                                            <TableCell className="text-right font-mono text-[11px]">{formatMoney(r.net_direct_rate)}</TableCell>
                                            <TableCell className="text-right font-mono text-[11px]">{formatMoney(r.amount)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DwlModelFormDialog
        open={showModelForm}
        onOpenChange={setShowModelForm}
        tenantId={tenantId}
        onCreated={(newId) => {
          void loadModels();
          setSelectedModelId(newId);
        }}
      />

      <DwlModelFactorFormDialog
        open={showFactorForm}
        onOpenChange={(open) => {
          setShowFactorForm(open);
          if (!open) setEditingFactor(null);
        }}
        tenantId={tenantId}
        model={selectedModelRow?.model ?? null}
        editingFactor={editingFactor}
        editingFactorAssembly={editingFactorAssembly}
        onSaved={() => {
          if (selectedModelRow) void loadFactors(selectedModelRow.model);
          void loadModels();
        }}
      />

      <DwlProjectFormDialog
        open={showProjectForm}
        onOpenChange={setShowProjectForm}
        tenantId={tenantId}
        models={activeModels}
        onCreated={(newId) => {
          void loadProjects();
          setSelectedProjectId(newId);
        }}
      />

      <DwlSnapshotDialog
        open={showSnapshotDialog}
        onOpenChange={setShowSnapshotDialog}
        tenantId={tenantId}
        userId={userId}
        project={selectedProject}
        payload={snapshotPayload}
        onIssued={() => {
          if (selectedProject) void loadSnapshots(selectedProject);
        }}
      />
    </div>
  );
}
