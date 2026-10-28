"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Download, Eye, EyeOff, Maximize2, Minimize2, GitBranch, History, ListChecks, Loader2, Trash2,
  Plus, Search, Send, ShieldCheck, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useQtoPermissions } from "@/hooks/use-qto-permissions";
import { getBudgetCodes } from "@/lib/qs/public-tender";
import { getDrawingUrl, listDrawings, type QtoDrawing, type QtoDrawingRevision } from "@/lib/qs/qto-service";
import { compareItems, summarizeChanges, CHANGE_LABEL, type ChangeRow } from "@/lib/qs/qto/compare";
import { validateVersion } from "@/lib/qs/qto/validation";
import {
  TRANSITION_NEEDS, VERSION_STATUS_LABEL, canStartNewVersion, canTransitionVersion, isEditable, type VersionStatus,
} from "@/lib/qs/qto/workflow";
import type { QtoCalibration, QtoRuleVersion, QtoSessionVersion, TakeoffItem } from "@/lib/qs/qto/types";
import {
  acknowledgeIssue, addMeasurement, createItem, createVersion, deleteItem, deleteMeasurement, duplicateItem,
  getActiveCalibrations, getAuditHistory, getProfileNames, getSessionBundle, getTender, getVersionWorkspace,
  listRulesets, listTenderBoqLines, listTenderRevisions, listWbsNodesForTender, publishVersion, recordCalculation,
  saveCalibration, setBoqLink, setFactors, syncIssues, transitionVersion, updateItem, updateMeasurementGeometry,
  type AuditEntry, type RevisionOption, type RulesetWithVersions, type SessionBundle, type TenderBoqLine, type VersionWorkspace,
} from "@/lib/qs/qto/session-service";
import { DrawingViewer, type ActiveCalibration, type EmittedMeasurement } from "@/components/qs/qto/drawing-viewer";
import { TOOL_META, type TakeoffConfig, type TakeoffTool } from "@/components/qs/qto/takeoff-start-panel";
import { AreaIcon, CountIcon, LengthIcon } from "@/components/qs/qto/takeoff-icons";
import { PanelSplitter } from "@/components/qs/qto/panel-splitter";
import { DeleteTakeoffDialog } from "@/components/qs/qto/delete-takeoff-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { decodeDimensionPoints } from "@/lib/qs/qto/dimension-geometry";
import { fmtQty, isAutoRun, measuredRun, volumeOf, type VolumeSpec } from "@/lib/qs/qto/measured-quantity";
import { areaInSquareMetres, lengthInMetres, perimeter, polygonArea, polylineLength, type Pt } from "@/lib/qs/qto/geometry";

const PANEL_KEY = "dcos.qto.panels";
const PANELS = { left: { def: 280, min: 200, max: 520 }, right: { def: 360, min: 280, max: 680 } };

/** Column widths of the session workspace, remembered per browser. */
function usePanelWidths() {
  const [w, setW] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PANEL_KEY) ?? "null") as { left: number; right: number } | null;
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.right)) return saved;
    } catch { /* storage unavailable */ }
    return { left: PANELS.left.def, right: PANELS.right.def };
  });
  const update = (patch: Partial<{ left: number; right: number }>) => setW((cur) => {
    const next = { ...cur, ...patch };
    try { window.localStorage.setItem(PANEL_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });
  return [w, update] as const;
}
import { QtoItemPanel } from "@/components/qs/qto/qto-item-panel";
import {
  CalibrationDialog, NewVersionDialog, PublishDialog, TransferDialog, TransitionDialog, exportPublication,
} from "@/components/qs/qto/qto-session-dialogs";

export const STATUS_TONE: Record<VersionStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  SUBMITTED_FOR_REVIEW: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  CHANGES_REQUESTED: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  PUBLISHED: "bg-emerald-600 text-white",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[status])}>{VERSION_STATUS_LABEL[status]}</span>;
}

const QTY_TONE: Record<string, string> = {
  FIRM: "",
  PROVISIONAL: "border-l-2 border-l-amber-500",
  EXCLUDED: "opacity-60 line-through",
  PENDING_CLARIFICATION: "border-l-2 border-l-violet-500",
};

type BottomTab = "issues" | "changes" | "history";

export function QtoSessionWorkspace({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, loaded: permsLoaded } = useQtoPermissions();

  const [bundle, setBundle] = useState<SessionBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(searchParams.get("version"));
  const [ws, setWs] = useState<VersionWorkspace | null>(null);
  const [wsLoading, setWsLoading] = useState(false);
  const [rulesets, setRulesets] = useState<RulesetWithVersions[]>([]);
  const [tender, setTender] = useState<{ id: string; tender_no: string; title: string; project_id: string | null } | null>(null);
  const [drawings, setDrawings] = useState<QtoDrawing[]>([]);
  const [revisions, setRevisions] = useState<RevisionOption[]>([]);
  const [boqLines, setBoqLines] = useState<TenderBoqLine[]>([]);
  const [wbsNodes, setWbsNodes] = useState<{ id: string; wbs_code: string | null; wbs_name: string | null }[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<{ id: string; code: string; description: string | null }[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(searchParams.get("item"));
  /** Items hidden on the drawing (eye toggle in the Takeoffs panel); view only. */
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set());
  /** The shape clicked on the drawing (an item can have several); null when picked from the list. */
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteDimension, setConfirmDeleteDimension] = useState(false);
  const [panelW, setPanelW] = usePanelWidths();
  /** Focus mode: the workspace fills the browser window (over the app bar and module tabs). */
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc leaves focus mode unless the drawing or a dialog is using it.
      const t = e.target as HTMLElement | null;
      if (e.key !== "Escape" || t?.closest('[role="application"], [role="dialog"], input, textarea, select')) return;
      setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [drawingUrl, setDrawingUrl] = useState<string | null>(null);
  const [calibrations, setCalibrations] = useState<QtoCalibration[]>([]);
  const [pendingCal, setPendingCal] = useState<{ points: { x: number; y: number }[]; pageUnits: number; page_no: number } | null>(null);

  // Collapsed by default to leave room for the drawing; Validate opens it.
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("issues");
  const [baselineWs, setBaselineWs] = useState<VersionWorkspace | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [validating, setValidating] = useState(false);

  const [dialog, setDialog] = useState<
    | { kind: "transition"; to: Exclude<VersionStatus, "PUBLISHED" | "DRAFT">; commentRequired: boolean }
    | { kind: "newVersion" } | { kind: "publish" } | { kind: "transfer"; publicationId: string } | null
  >(null);

  // ── Loading ─────────────────────────────────────────────────────────────
  const loadBundle = useCallback(async () => {
    try {
      const [b, { data: { user } }] = await Promise.all([getSessionBundle(sessionId), createClient().auth.getUser()]);
      setUserId(user?.id ?? null);
      setBundle(b);
      setLoadError(null);
      return b;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the session");
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    void (async () => {
      const b = await loadBundle();
      if (!b) return;
      const [t, sets, drw, revs, lines, codes] = await Promise.all([
        getTender(b.session.tender_id),
        listRulesets(),
        listDrawings(b.session.tender_id).then((r) => r.data ?? []),
        listTenderRevisions(b.session.tender_id),
        listTenderBoqLines(b.session.tender_id),
        getBudgetCodes().catch(() => []),
      ]);
      setTender(t);
      setRulesets(sets);
      setDrawings(drw);
      setRevisions(revs);
      setBoqLines(lines);
      setBudgetCodes(codes.map((c) => ({ id: c.id, code: c.code, description: c.description })));
      setWbsNodes(await listWbsNodesForTender(t?.project_id ?? b.session.project_id).catch(() => []));
    })();
  }, [loadBundle]);

  const version: QtoSessionVersion | null = useMemo(() => {
    if (!bundle) return null;
    return bundle.versions.find((v) => v.id === versionId) ?? bundle.versions.find((v) => v.id === bundle.session.current_version_id) ?? null;
  }, [bundle, versionId]);

  // Delete key: confirm deleting the selected take-off (not while typing or in a dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || !selectedItemId || confirmDelete || confirmDeleteDimension) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      e.preventDefault();
      if (!version || !isEditable(version.status)) { toast.error("This version is read-only"); return; }
      const selectedMeasurement = (ws?.measurements ?? []).find((measurement) =>
        measurement.id === selectedShapeId && !!decodeDimensionPoints(measurement.points),
      );
      if (selectedMeasurement) setConfirmDeleteDimension(true);
      else setConfirmDelete(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItemId, selectedShapeId, ws, confirmDelete, confirmDeleteDimension, version]);

  const loadWs = useCallback(async (vId: string) => {
    setWsLoading(true);
    try {
      setWs(await getVersionWorkspace(vId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the take-off items");
    } finally {
      setWsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (version) void loadWs(version.id);
  }, [version, loadWs]);

  const revision = useMemo(() => revisions.find((r) => r.id === version?.drawing_revision_id) ?? null, [revisions, version]);
  const drawing = useMemo(() => drawings.find((d) => d.id === revision?.drawing_id) ?? null, [drawings, revision]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!revision) { setDrawingUrl(null); setCalibrations([]); return; }
    void getDrawingUrl(revision).then(setDrawingUrl);
    void getActiveCalibrations(revision.id).then(setCalibrations).catch(() => setCalibrations([]));
  }, [revision]);

  const ruleVersion: QtoRuleVersion | null = useMemo(() => {
    for (const s of rulesets) {
      const v = s.versions.find((x) => x.id === version?.ruleset_version_id);
      if (v) return v;
    }
    return null;
  }, [rulesets, version]);
  const rulesetLabel = useMemo(() => {
    const s = rulesets.find((r) => r.versions.some((v) => v.id === version?.ruleset_version_id));
    return s && ruleVersion ? `${s.code} v${ruleVersion.version_no}` : "—";
  }, [rulesets, ruleVersion, version]);

  // Reviewer names for the history.
  useEffect(() => {
    if (!bundle) return;
    const ids = [
      ...bundle.reviews.map((r) => r.actor_id), ...bundle.versions.flatMap((v) => [v.submitted_by, v.approved_by, v.published_by]),
      bundle.session.responsible_qs, ...audit.map((a) => a.changed_by),
    ].filter((x): x is string => !!x);
    void getProfileNames(ids).then(setNames).catch(() => undefined);
  }, [bundle, audit]);

  const baselineId = version?.baseline_version_id ?? version?.parent_version_id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!baselineId) { setBaselineWs(null); return; }
    void getVersionWorkspace(baselineId).then(setBaselineWs).catch(() => setBaselineWs(null));
  }, [baselineId]);

  useEffect(() => {
    if (bottomTab !== "history" || !version || !ws) return;
    void getAuditHistory([version.id, ...ws.items.map((i) => i.id)]).then(setAudit).catch(() => setAudit([]));
  }, [bottomTab, version, ws]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const editable = !!version && isEditable(version.status) && can("qto_workspace", "edit");
  const items = useMemo(() => ws?.items ?? [], [ws]);
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [i.qto_no, i.description, i.work_section, i.item_code, i.building, i.level].some((s) => s?.toLowerCase().includes(q)));
  }, [items, search]);
  const selected = items.find((i) => i.id === selectedItemId) ?? null;
  const selectedDimension = (ws?.measurements ?? []).find((measurement) =>
    measurement.id === selectedShapeId && !!decodeDimensionPoints(measurement.points),
  ) ?? null;
  const runsByItem = useMemo(() => {
    const m = new Map<string, NonNullable<VersionWorkspace["runs"]>[number]>();
    for (const r of ws?.runs ?? []) if (!m.has(r.item_id)) m.set(r.item_id, r);
    return m;
  }, [ws]);
  const openIssues = (ws?.issues ?? []).filter((i) => i.status !== "resolved");
  const blocking = openIssues.filter((i) => i.severity === "BLOCKING" && i.status === "open").length;
  const totals = useMemo(() => {
    const t: Record<string, { firm: number; provisional: number }> = {};
    for (const i of items) {
      if (i.quantity_status === "EXCLUDED" || i.quantity_status === "PENDING_CLARIFICATION") continue;
      t[i.unit] ??= { firm: 0, provisional: 0 };
      t[i.unit][i.quantity_status === "FIRM" ? "firm" : "provisional"] += Number(i.quantity);
    }
    return t;
  }, [items]);
  const activeCal: ActiveCalibration | null = useMemo(() => {
    const c = calibrations.find((x) => x.page_no === page);
    return c ? { id: c.id, metresPerUnit: Number(c.metres_per_unit), knownDistance: Number(c.known_distance), knownUnit: c.known_unit } : null;
  }, [calibrations, page]);
  const changes: ChangeRow[] = useMemo(
    () => (baselineWs && ws ? compareItems(baselineWs.items, ws.items) : []),
    [baselineWs, ws],
  );
  const publication = bundle?.publications.find((p) => p.version_id === version?.id) ?? null;
  const revisionsByDrawing = useMemo(() => {
    const m: Record<string, QtoDrawingRevision[]> = {};
    for (const r of revisions) (m[r.drawing_id] ??= []).push(r as unknown as QtoDrawingRevision);
    return m;
  }, [revisions]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const refresh = async () => {
    await loadBundle();
    if (version) await loadWs(version.id);
  };
  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The action failed");
    }
  };

  async function addItem(seed?: Partial<TakeoffItem>) {
    if (!version || !bundle) return null;
    try {
      const it = await createItem(version, bundle.session.tender_id, {
        description: seed?.description ?? "New item",
        unit: seed?.unit ?? "m2",
        work_section: seed?.work_section ?? null,
        building: bundle.session.building,
        discipline: bundle.session.trade,
        page_no: page,
      });
      await loadWs(version.id);
      setSelectedItemId(it.id);
      return it;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the item");
      return null;
    }
  }

  /** Sum of an item's measurements in the unit of its tool (m2 areas, m lengths, No. counts). */
  function measuredTotal(itemId: string, unit: string) {
    let t = 0;
    for (const m of ws?.measurements ?? []) {
      if (m.qto_item_id !== itemId) continue;
      if (unit === "m2" && m.measure_type === "area") t += Number(m.area ?? 0);
      else if (unit === "m" && m.measure_type !== "area" && m.measure_type !== "count") t += Number(m.length ?? 0);
      else if (unit === "No." && m.measure_type === "count") t += Number(m.count ?? 0);
    }
    return t;
  }

  /** The "New …" panel measures into the selected item when its unit fits, otherwise into a new item. */
  function takeoffTarget(tool: TakeoffTool) {
    const meta = TOOL_META[tool];
    // A selected volume item takes measurements of its own kind (areas for area × depth, lengths for L × W × D).
    const vol = selected ? volumeOf(runsByItem.get(selected.id)) : null;
    const fits = !!selected && editable && (selected.unit === meta.unit || (selected.unit === "m3" && !!vol && vol.mode === meta.volume));
    const sameUnit = items.filter((i) => i.unit === meta.unit).length;
    return {
      defaultName: `${meta.title} ${sameUnit + 1}`,
      existingName: fits ? selected!.description : null,
      total: fits ? (selected!.unit === "m3" ? Number(selected!.quantity) : measuredTotal(selected!.id, meta.unit)) : 0,
      color: fits ? selected!.display_color : null,
      opacity: fits && selected!.display_opacity !== null ? Number(selected!.display_opacity) : null,
      volume: fits ? vol : null,
    };
  }

  async function startTakeoff(cfg: TakeoffConfig) {
    if (!version || !bundle) return;
    try {
      const selVol = selected ? volumeOf(runsByItem.get(selected.id)) : null;
      if (!cfg.newItem && selected && selected.unit === cfg.unit && (cfg.unit !== "m3" || selVol?.mode === cfg.volume?.mode)) {
        if (selected.display_color !== cfg.color || Number(selected.display_opacity) !== cfg.opacity) {
          await updateItem(selected.id, { display_color: cfg.color, display_opacity: cfg.opacity });
          await loadWs(version.id);
        }
        if (cfg.volume && JSON.stringify(cfg.volume) !== JSON.stringify(selVol)) {
          await syncMeasuredQuantities(version.id, [selected.id], { [selected.id]: cfg.volume });
        }
        return;
      }
      const it = await createItem(version, bundle.session.tender_id, {
        description: cfg.name, unit: cfg.unit, building: bundle.session.building, discipline: bundle.session.trade,
        page_no: page, display_color: cfg.color, display_opacity: cfg.opacity,
      });
      // A volume item records its dimensions straight away (quantity 0 until measured).
      if (cfg.volume) await syncMeasuredQuantities(version.id, [it.id], { [it.id]: cfg.volume });
      else await loadWs(version.id);
      setSelectedItemId(it.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the take-off");
      throw e;
    }
  }

  /**
   * Items whose quantity follows the drawing (no calculation yet, or one made from the measurements)
   * get a fresh "sum of measurements" run. A hand-built calculation is never overwritten, and items
   * carried forward unverified are left for the user to remeasure or confirm.
   */
  async function syncMeasuredQuantities(vId: string, onlyItemIds?: string[], volumes?: Record<string, VolumeSpec>) {
    const fresh = await getVersionWorkspace(vId);
    const latest = new Map<string, (typeof fresh.runs)[number]>();
    for (const r of fresh.runs) if (!latest.has(r.item_id)) latest.set(r.item_id, r);
    let changed = false;
    for (const item of fresh.items) {
      if (onlyItemIds && !onlyItemIds.includes(item.id)) continue;
      const last = latest.get(item.id);
      if (last && !isAutoRun(last)) continue;
      const ms = fresh.measurements.filter((m) => m.qto_item_id === item.id);
      if (!onlyItemIds && (last || ms.length === 0 || item.carry_status === "UNVERIFIED")) continue;
      const override = volumes?.[item.id];
      const volume = override ?? volumeOf(last);
      const run = measuredRun({
        unit: item.unit, measurements: ms, ruleset: ruleVersion?.definition ?? null, volume,
        factors: fresh.factors.filter((f) => f.item_id === item.id).map((f) => ({ name: f.factor_name, value: String(f.factor_value) })),
      });
      if (!run?.valid) continue;
      if (!override && last && Number(last.result) === Number(run.result) && Number(item.quantity) === Number(run.result)) continue;
      await recordCalculation(item.id, run, volume ? { auto: true, volume } : { auto: true });
      changed = true;
    }
    setWs(changed ? await getVersionWorkspace(vId) : fresh);
  }

  // When the version opens, catch up items that have measurements but no calculation yet.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!version || !editable || !ruleVersion || synced.current === version.id) return;
    synced.current = version.id;
    void syncMeasuredQuantities(version.id).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id, editable, ruleVersion]);

  /** A shape reshaped with its grips: recompute its length / area with the page scale, save, resync the item. */
  async function onEditShape(shapeId: string, points: Pt[]) {
    if (!editable || !version) return;
    const m = ws?.measurements.find((x) => x.id === shapeId);
    if (!m) return;
    const c = calibrations.find((x) => x.page_no === (m.page_no ?? 1));
    const cal = c ? { metresPerUnit: Number(c.metres_per_unit) } : null;
    let length: number | null = m.length;
    let area: number | null = m.area;
    if (m.measure_type === "area") area = cal ? areaInSquareMetres(polygonArea(points), cal) : null;
    else if (m.measure_type === "perimeter") length = cal ? lengthInMetres(perimeter(points), cal) : null;
    else if (m.measure_type === "length" || m.measure_type === "polyline") length = cal ? lengthInMetres(polylineLength(points), cal) : null;
    await guard(async () => {
      await updateMeasurementGeometry(shapeId, { points, length, area });
      await syncMeasuredQuantities(version.id, [m.qto_item_id]);
    }, area !== null && m.measure_type === "area" ? `Area updated: ${fmtQty(area)} m²` : length !== null ? `Length updated: ${fmtQty(length)} m` : "Shape updated");
  }

  async function onMeasure(m: EmittedMeasurement) {
    await onMeasureMany([m]);
  }

  /** Saves measurements to the selected item (one quantity update for all, e.g. a Same hatch pick). */
  async function onMeasureMany(ms: EmittedMeasurement[]) {
    const m = ms[0];
    if (!m || !editable || !version) return;
    if (m.measure_type !== "count" && m.measure_type !== "point" && !activeCal) {
      toast.error("Set the scale on this page before measuring lengths or areas");
      return;
    }
    let target = selected;
    if (!target) {
      const unit = m.measure_type === "area" ? "m2" : m.measure_type === "count" ? "No." : "m";
      target = await addItem({ description: `New ${m.measure_type} item`, unit });
      if (!target) return;
    }
    await guard(async () => {
      for (const x of ms) {
        await addMeasurement(target!.id, {
          drawing_revision_id: version.drawing_revision_id, drawing_id: revision?.drawing_id ?? null, page_no: x.page_no,
          measure_type: x.measure_type, points: x.points, length: x.length, area: x.area, count: x.count, unit: x.unit,
          label: null, calibration_id: activeCal?.id ?? null,
        });
      }
      await syncMeasuredQuantities(version.id, [target!.id]);
    }, ms.length > 1 ? `${ms.length} measurements saved to ${target.qto_no}` : "Measurement saved to " + target.qto_no);
  }

  async function runValidation() {
    if (!version || !ws) return;
    setValidating(true);
    try {
      const factorsByItem: Record<string, typeof ws.factors> = {};
      for (const f of ws.factors) (factorsByItem[f.item_id] ??= []).push(f);
      const issues = validateVersion({
        version, items: ws.items, factorsByItem, calculatedItemIds: new Set(ws.runs.map((r) => r.item_id)),
        ruleset: ruleVersion?.definition ?? null, baselineItems: baselineWs?.items,
      });
      const r = await syncIssues(version.id, issues);
      toast.success(`Validation: ${r.open} open issue(s)${r.resolved ? `, ${r.resolved} resolved` : ""}`);
      await loadWs(version.id);
      setBottomTab("issues");
      setBottomOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function doTransition(to: Exclude<VersionStatus, "PUBLISHED" | "DRAFT">, comment: string) {
    if (!version) return;
    if (to === "SUBMITTED_FOR_REVIEW") await runValidation();
    await guard(async () => {
      await transitionVersion(version.id, to, comment);
      setDialog(null);
      await refresh();
    }, `Version ${version.version_no}: ${VERSION_STATUS_LABEL[to]}`);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/qto")}><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to sessions</Button>
      </div>
    );
  }
  if (!bundle || !version || !permsLoaded) {
    return <div className="space-y-3 p-2"><Skeleton className="h-10 w-96" /><Skeleton className="h-[70vh] w-full" /></div>;
  }

  const { session } = bundle;
  const nextActions = (["IN_PROGRESS", "SUBMITTED_FOR_REVIEW", "APPROVED", "CHANGES_REQUESTED", "CANCELLED"] as const)
    .filter((to) => canTransitionVersion(version.status, to))
    .filter((to) => can(TRANSITION_NEEDS[to].action, TRANSITION_NEEDS[to].field as "edit"))
    // The submitter may not decide on their own submission (the server rejects it too).
    .filter((to) => !((to === "APPROVED" || to === "CHANGES_REQUESTED") && version.submitted_by === userId));
  const isLatest = session.current_version_id === version.id;

  return (
    <div className={focusMode
      ? "fixed inset-0 z-50 flex flex-col gap-1.5 bg-background p-1.5"
      : "flex h-[calc(100vh-7rem)] min-h-[640px] flex-col gap-1.5"}>
      {/* Top bar: session, version, status, actions (one compact row) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-background px-2 py-1">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Back to sessions" onClick={() => router.push(`/dashboard/qto?tender=${session.tender_id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">{session.session_code}</span>
          <h1 className="truncate text-sm font-semibold">{session.name}</h1>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{session.purpose === "TENDER" ? "Tender" : "Construction"}</Badge>
          <p className="hidden truncate text-[11px] text-muted-foreground xl:block">
            {tender ? `${tender.tender_no} · ` : ""}{drawing ? `${drawing.drawing_no} Rev ${revision?.revision}` : "No source"} · rules {rulesetLabel}
            {revision && revision.status !== "current" && <span className="ml-1 text-amber-700 dark:text-amber-300">({revision.status} revision)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-7 rounded-md border border-input bg-transparent px-2 text-xs" value={version.id}
            onChange={(e) => { setVersionId(e.target.value); setSelectedItemId(null); }} aria-label="Version">
            {bundle.versions.map((v) => (
              <option key={v.id} value={v.id}>v{v.version_no} · {VERSION_STATUS_LABEL[v.status]}{v.id === session.current_version_id ? " (current)" : ""}</option>
            ))}
          </select>
          <VersionStatusBadge status={version.status} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {editable && selectedDimension && (
            <Button size="sm" className="h-7 px-2 text-xs" variant="outline" onClick={() => setConfirmDeleteDimension(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete dimension
            </Button>
          )}
          {editable && (
            <Button size="sm" className="h-7 px-2 text-xs" variant="outline" onClick={() => void runValidation()} disabled={validating}>
              {validating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ListChecks className="mr-1 h-3.5 w-3.5" />} Validate
            </Button>
          )}
          {nextActions.map((to) => (
            <Button key={to} size="sm" className="h-7 px-2 text-xs" variant={to === "CANCELLED" || to === "CHANGES_REQUESTED" ? "outline" : "default"}
              onClick={() => setDialog({ kind: "transition", to, commentRequired: TRANSITION_NEEDS[to].comment === "required" })}>
              {to === "SUBMITTED_FOR_REVIEW" && <Send className="mr-1 h-3.5 w-3.5" />}
              {to === "APPROVED" && <ShieldCheck className="mr-1 h-3.5 w-3.5" />}
              {{ IN_PROGRESS: version.status === "DRAFT" ? "Start measuring" : "Resume work", SUBMITTED_FOR_REVIEW: "Submit for review", APPROVED: "Approve", CHANGES_REQUESTED: "Request changes", CANCELLED: "Cancel version" }[to]}
            </Button>
          ))}
          {version.status === "APPROVED" && can("qto_publish", "approve") && (
            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setDialog({ kind: "publish" })}><Upload className="mr-1 h-3.5 w-3.5" /> Publish</Button>
          )}
          {publication && can("qto_transfer", "submit") && (
            <Button size="sm" className="h-7 px-2 text-xs" variant="outline" onClick={() => setDialog({ kind: "transfer", publicationId: publication.id })}>Transfer to BOQ</Button>
          )}
          {publication && can("qto_export", "export") && (
            <>
              <Button size="sm" className="h-7 px-2 text-xs" variant="outline" title="Export the published snapshot to Excel"
                onClick={() => void guard(() => exportPublication(publication, "xlsx", lookups(wbsNodes, budgetCodes)))}><Download className="mr-1 h-3.5 w-3.5" /> Excel</Button>
              <Button size="sm" className="h-7 px-2 text-xs" variant="ghost" onClick={() => void guard(() => exportPublication(publication, "csv", lookups(wbsNodes, budgetCodes)))}>CSV</Button>
            </>
          )}
          {isLatest && canStartNewVersion(version.status) && can("qto_sessions", "can_create") && (
            <Button size="sm" className="h-7 px-2 text-xs" variant="outline" onClick={() => setDialog({ kind: "newVersion" })}><GitBranch className="mr-1 h-3.5 w-3.5" /> New version</Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-pressed={focusMode}
            title={focusMode ? "Exit focus mode (Esc)" : "Focus mode: use the whole window for the drawing"}
            onClick={() => setFocusMode((f) => !f)}>
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {!editable && version.status !== "PUBLISHED" && (
        <p className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          {version.status === "SUBMITTED_FOR_REVIEW" ? "Submitted for review — read-only until a reviewer decides."
            : version.status === "APPROVED" ? "Approved — read-only. Publish it to make it the quantity baseline."
            : version.status === "CANCELLED" ? `Cancelled: ${version.cancel_reason ?? ""}`
            : can("qto_workspace", "edit") ? "Read-only." : "You can view this take-off but not edit it."}
        </p>
      )}
      {publication && (
        <p className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Published {new Date(publication.published_at).toLocaleString()} by {names[publication.published_by ?? ""] ?? "—"} · {publication.item_count} items · sha256 {publication.snapshot_hash.slice(0, 16)}… · immutable
        </p>
      )}

      {/* Main: takeoffs | drawing | properties */}
      <div
        className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:gap-0 lg:[grid-template-columns:var(--qto-cols)]"
        style={{ "--qto-cols": `${panelW.left}px 8px minmax(0,1fr) 8px ${panelW.right}px` } as React.CSSProperties}
      >
        {/* Takeoffs: one row per item, eye toggles it on the sheet */}
        <section className="flex min-h-[240px] flex-col rounded-lg border border-border lg:min-h-0" aria-label="Takeoffs">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <h2 className="text-sm font-semibold">Takeoffs</h2>
            <span className="text-xs text-muted-foreground">({items.length})</span>
            <button className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={hiddenItems.size ? "Show all on the drawing" : "Hide all on the drawing"}
              onClick={() => setHiddenItems(hiddenItems.size ? new Set() : new Set(items.map((i) => i.id)))}>
              {hiddenItems.size ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            {editable && <Button size="sm" className="h-7 w-7 p-0" title="Add item" onClick={() => void addItem()}><Plus className="h-4 w-4" /></Button>}
          </div>
          <div className="border-b border-border p-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-7 pl-7 text-xs" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {wsLoading && !ws ? <div className="p-3"><Skeleton className="h-16 w-full" /></div>
              : visibleItems.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">{items.length === 0 ? (editable ? "No takeoffs yet. Pick a tool and measure on the drawing." : "No items in this version.") : "No items match."}</p>
              ) : (
                <ul>
                  {visibleItems.map((i) => {
                    const blockingIssue = openIssues.some((x) => x.item_id === i.id && x.severity === "BLOCKING");
                    const hidden = hiddenItems.has(i.id);
                    const TypeIcon = i.unit === "No." ? CountIcon : i.unit === "m" ? LengthIcon : AreaIcon;
                    return (
                      <li key={i.id}
                        className={cn("flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs", QTY_TONE[i.quantity_status],
                          i.id === selectedItemId ? "bg-primary/10" : "hover:bg-muted/60", hidden && "opacity-50")}>
                        <button className="shrink-0 text-muted-foreground hover:text-foreground" aria-pressed={!hidden}
                          title={hidden ? "Show on the drawing" : "Hide on the drawing"}
                          onClick={() => setHiddenItems((h) => { const n = new Set(h); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })}>
                          {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setSelectedItemId(i.id === selectedItemId ? null : i.id); setSelectedShapeId(null); }}>
                          <TypeIcon size={16} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{i.description}</span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {i.qto_no}{i.work_section ? ` · ${i.work_section}` : ""}{i.quantity_status !== "FIRM" ? ` · ${i.quantity_status.replace("_", " ").toLowerCase()}` : ""}
                            </span>
                          </span>
                          {blockingIssue && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                          <span className="shrink-0 tabular-nums text-primary">
                            {fmtQty(i.quantity)}
                            <span className="ml-0.5 text-muted-foreground">{i.unit === "m2" ? "m²" : i.unit === "m3" ? "m³" : i.unit}</span>
                          </span>
                          <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10" style={{ background: i.display_color ?? "#2563eb" }} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
          <div className="border-t border-border px-2 py-1 text-[11px]">
            {Object.keys(totals).length === 0 ? <span className="text-muted-foreground">No quantities yet</span> : Object.entries(totals).map(([u, t]) => (
              <div key={u} className="flex justify-between tabular-nums">
                <span className="text-muted-foreground">Total {u}</span>
                <span>{fmtQty(t.firm)}{t.provisional ? <span className="text-amber-700 dark:text-amber-300"> + {fmtQty(t.provisional)} prov.</span> : null}</span>
              </div>
            ))}
          </div>
        </section>

        <PanelSplitter side="left" label="Resize the Takeoffs panel" width={panelW.left} min={PANELS.left.min} max={PANELS.left.max}
          defaultWidth={PANELS.left.def} onChange={(left) => setPanelW({ left })} />
        <div className="min-h-[420px] overflow-hidden rounded-lg border border-border">
          <DrawingViewer
            url={drawingUrl}
            calibration={activeCal}
            readOnly={!editable}
            onPageChange={setPage}
            onCalibrationPicked={(c) => setPendingCal(c)}
            onPresetScale={(n, pageNo) => {
              if (!revision) return;
              if (!window.confirm(`Set page ${pageNo} to 1:${n}?\n\nThis is only right if the PDF was exported at true paper size. Check it afterwards by measuring a known dimension, or use Scale on a dimension line instead.`)) return;
              // 72 PDF units = 1 inch on paper = 25.4 mm × N on site.
              void guard(async () => {
                await saveCalibration({ revisionId: revision.id, pageNo, points: [{ x: 0, y: 0 }, { x: 72, y: 0 }], pixelDistance: 72, knownDistance: 25.4 * n, knownUnit: "mm" });
                setCalibrations(await getActiveCalibrations(revision.id));
              }, `Scale set to 1:${n}`);
            }}
            onMeasure={(m) => void onMeasure(m)}
            onMeasureMany={(ms) => void onMeasureMany(ms)}
            onSelectItem={(id, shapeId) => { setSelectedItemId(id); setSelectedShapeId(shapeId ?? null); }}
            onEditShape={editable ? (id, pts) => void onEditShape(id, pts) : undefined}
            onStartTakeoff={editable ? startTakeoff : undefined}
            takeoffTarget={takeoffTarget}
            activeTakeoff={selected ? {
              name: `${selected.qto_no} · ${selected.description}`,
              color: selected.display_color ?? "#2563eb",
              total: selected.unit === "m3" ? Number(selected.quantity) : measuredTotal(selected.id, selected.unit),
              unit: selected.unit === "m2" ? "m²" : selected.unit === "m3" ? "m³" : selected.unit,
            } : null}
            savedMeasurements={(ws?.measurements ?? [])
              .filter((m) => m.drawing_revision_id === version.drawing_revision_id && !hiddenItems.has(m.qto_item_id))
              .map((m) => {
                const owner = items.find((i) => i.id === m.qto_item_id);
                const dimension = decodeDimensionPoints(m.points ?? []);
                return {
                  id: m.id, itemId: m.qto_item_id, page_no: m.page_no, measure_type: m.measure_type,
                  points: dimension ? m.points.slice(0, 2) : m.points ?? [],
                  length: m.length,
                  dimension,
                  highlighted: m.qto_item_id === selectedItemId,
                  color: owner?.display_color ?? null,
                  opacity: owner?.display_opacity !== null && owner?.display_opacity !== undefined ? Number(owner.display_opacity) : null,
                };
              })}
          />
        </div>

        {/* Properties of the selected takeoff */}
        <PanelSplitter side="right" label="Resize the Properties panel" width={panelW.right} min={PANELS.right.min} max={PANELS.right.max}
          defaultWidth={PANELS.right.def} onChange={(right) => setPanelW({ right })} />
        <section className="min-h-0 overflow-y-auto rounded-lg border border-border" aria-label="Properties">
          <h2 className="sticky top-0 z-10 border-b border-border bg-background px-3 py-1.5 text-sm font-semibold">Properties</h2>
          <div className="p-3">
            {selected ? (
              <QtoItemPanel
                item={selected}
                editable={editable}
                ruleset={ruleVersion?.definition ?? null}
                latestRun={runsByItem.get(selected.id) ?? null}
                factors={(ws?.factors ?? []).filter((f) => f.item_id === selected.id)}
                measurements={(ws?.measurements ?? []).filter((m) => m.qto_item_id === selected.id)}
                boqLines={boqLines}
                boqLinkId={ws?.boqLinks.find((l) => l.qto_item_id === selected.id)?.boq_item_id ?? null}
                boqLinkLocked={!!ws?.boqLinks.find((l) => l.qto_item_id === selected.id && l.transfer_id)}
                wbsNodes={wbsNodes}
                budgetCodes={budgetCodes}
                onSave={async (patch) => { await updateItem(selected.id, patch); await loadWs(version.id); }}
                onSaveCalculation={async ({ run, factors, ruleCode }) => {
                  await setFactors(selected.id, factors.map((f) => ({ name: f.name, value: String(f.value) })));
                  await recordCalculation(selected.id, { ...run, rule_code: ruleCode });
                  await loadWs(version.id);
                }}
                onSetBoqLink={(boqId) => guard(async () => { await setBoqLink(selected.id, boqId, Number(selected.quantity)); await loadWs(version.id); })}
                volume={volumeOf(runsByItem.get(selected.id))}
              onSetVolume={(v) => guard(() => syncMeasuredQuantities(version.id, [selected.id], { [selected.id]: v }), "Volume dimensions updated")}
              onDeleteMeasurement={(id) => guard(async () => { await deleteMeasurement(id); await syncMeasuredQuantities(version.id, [selected.id]); })}
                onDuplicate={() => guard(async () => { const c = await duplicateItem(version, selected); await loadWs(version.id); setSelectedItemId(c.id); }, "Item duplicated")}
                onDelete={async () => setConfirmDelete(true)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                <p>Select an item to see its classification, calculation and evidence.</p>
                {editable && <p>Measuring with no item selected creates a new item.</p>}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Bottom: issues, changes against the baseline, history */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center gap-1 border-b border-border px-2">
          {([
            ["issues", `Issues (${openIssues.length}${blocking ? `, ${blocking} blocking` : ""})`, ListChecks],
            ["changes", `Changes vs ${baselineId ? `v${bundle.versions.find((v) => v.id === baselineId)?.version_no}` : "baseline"}`, GitBranch],
            ["history", "History", History],
          ] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => { setBottomTab(k); setBottomOpen(true); }}
              className={cn("flex items-center gap-1 border-b-2 px-2 py-1.5 text-xs font-medium", bottomTab === k && bottomOpen ? "border-primary" : "border-transparent text-muted-foreground")}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
          <button className="ml-auto p-1 text-muted-foreground" onClick={() => setBottomOpen((o) => !o)} aria-label={bottomOpen ? "Collapse panel" : "Expand panel"}>
            {bottomOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {bottomOpen && (
          <div className="max-h-56 overflow-y-auto p-2 text-xs">
            {bottomTab === "issues" && (
              openIssues.length === 0 ? <p className="text-muted-foreground">No open issues. Run Validate after changes; submission re-checks blocking rules on the server.</p> : (
                <table className="w-full">
                  <tbody>
                    {openIssues.map((q) => (
                      <tr key={q.id} className="border-b border-border last:border-0">
                        <td className="w-20 py-1"><Badge variant={q.severity === "BLOCKING" ? "destructive" : "outline"}>{q.severity.toLowerCase()}</Badge></td>
                        <td className="py-1">
                          <button className="text-left hover:underline" disabled={!q.item_id} onClick={() => q.item_id && setSelectedItemId(q.item_id)}>{q.message}</button>
                          {q.status === "acknowledged" && <span className="ml-1 text-muted-foreground">— acknowledged: {q.justification}</span>}
                        </td>
                        <td className="w-28 py-1 text-right">
                          {q.severity === "WARNING" && q.status === "open" && editable && (
                            <button className="text-primary hover:underline" onClick={() => {
                              const j = window.prompt("Why is this warning acceptable?");
                              if (j?.trim()) void guard(async () => { await acknowledgeIssue(q.id, j); await loadWs(version.id); }, "Warning acknowledged");
                            }}>Acknowledge</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {bottomTab === "changes" && (
              !baselineId ? <p className="text-muted-foreground">This is the first version; there is no baseline to compare with.</p>
                : !baselineWs ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChangesTable rows={changes} />
            )}
            {bottomTab === "history" && (
              <ul className="space-y-1">
                {bundle.reviews.filter((r) => r.version_id === version.id).slice().reverse().map((r) => (
                  <li key={r.id}>
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span> · <b>{names[r.actor_id ?? ""] ?? "System"}</b>{" "}
                    {r.from_status ? `${VERSION_STATUS_LABEL[r.from_status as VersionStatus] ?? r.from_status} → ` : ""}{VERSION_STATUS_LABEL[r.to_status as VersionStatus] ?? r.to_status}
                    {r.comment && <span className="text-muted-foreground"> — “{r.comment}”</span>}
                  </li>
                ))}
                {audit.slice(0, 50).map((a) => (
                  <li key={a.id} className="text-muted-foreground">
                    {new Date(a.changed_at).toLocaleString()} · {names[a.changed_by ?? ""] ?? "—"} · {a.action.toLowerCase()} {a.table_name.replace("qto_", "").replace(/_/g, " ")}
                    {a.table_name === "qto_items" && a.new_data ? ` ${String(a.new_data.qto_no ?? "")}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {confirmDelete && selected && (() => {
        const shapes = (ws?.measurements ?? []).filter((m) => m.qto_item_id === selected.id);
        const shape = shapes.find((m) => m.id === selectedShapeId) ?? null;
        return (
          <DeleteTakeoffDialog
            itemLabel={`${selected.qto_no} · ${selected.description}`}
            quantity={selected.quantity}
            unit={selected.unit}
            shapeCount={shapes.length}
            shapeType={shape?.measure_type ?? null}
            canDeleteShape={!!shape && shapes.length > 1}
            onCancel={() => setConfirmDelete(false)}
            onDeleteShape={() => guard(async () => {
              await deleteMeasurement(shape!.id);
              setSelectedShapeId(null);
              setConfirmDelete(false);
              await syncMeasuredQuantities(version.id, [selected.id]);
            }, "Shape deleted")}
            onDeleteItem={() => guard(async () => {
              await deleteItem(selected.id);
              setConfirmDelete(false);
              setSelectedItemId(null);
              setSelectedShapeId(null);
              await loadWs(version.id);
            }, `${selected.qto_no} deleted`)}
          />
        );
      })()}
      {confirmDeleteDimension && selectedDimension && version && (
        <Dialog open onOpenChange={(open) => { if (!open) setConfirmDeleteDimension(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this dimension?</DialogTitle>
              <DialogDescription>
                This removes only the selected dimension measurement. The take-off item and any other measurements will remain.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDeleteDimension(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => void guard(async () => {
                await deleteMeasurement(selectedDimension.id);
                await syncMeasuredQuantities(version.id, [selectedDimension.qto_item_id]);
                setSelectedShapeId(null);
                setConfirmDeleteDimension(false);
              }, "Dimension deleted")}>
                <Trash2 className="mr-1 h-4 w-4" /> Delete dimension
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {pendingCal && revision && (
        <CalibrationDialog pageUnits={pendingCal.pageUnits} onCancel={() => setPendingCal(null)} onSave={async (known, unit) => {
          await guard(async () => {
            await saveCalibration({ revisionId: revision.id, pageNo: pendingCal.page_no, points: pendingCal.points, pixelDistance: pendingCal.pageUnits, knownDistance: known, knownUnit: unit });
            setCalibrations(await getActiveCalibrations(revision.id));
            setPendingCal(null);
          }, "Scale saved");
        }} />
      )}
      {dialog?.kind === "transition" && (
        <TransitionDialog to={dialog.to} commentRequired={dialog.commentRequired} onCancel={() => setDialog(null)} onConfirm={(c) => doTransition(dialog.to, c)} />
      )}
      {dialog?.kind === "publish" && (
        <PublishDialog versionNo={version.version_no} itemCount={items.length} onCancel={() => setDialog(null)} onConfirm={() => guard(async () => {
          await publishVersion(version.id);
          setDialog(null);
          await refresh();
        }, "Published")} />
      )}
      {dialog?.kind === "transfer" && publication && tender && (
        <TransferDialog publication={publication} tenderId={tender.id} tenderLabel={`${tender.tender_no} — ${tender.title}`}
          history={bundle.transfers.filter((t) => t.publication_id === publication.id)}
          onClose={() => setDialog(null)} onDone={() => void refresh().then(() => listTenderBoqLines(session.tender_id).then(setBoqLines))} />
      )}
      {dialog?.kind === "newVersion" && (
        <NewVersionDialog
          items={items}
          drawings={drawings}
          revisionsByDrawing={revisionsByDrawing}
          currentRevisionId={version.drawing_revision_id}
          rulesetVersions={rulesets.flatMap((s) => s.versions.filter((v) => v.status === "approved").map((v) => ({ id: v.id, label: `${s.code} v${v.version_no} — ${s.name}` })))}
          currentRulesetVersionId={version.ruleset_version_id}
          onCancel={() => setDialog(null)}
          onCreate={({ reason, revisionId, rulesetVersionId, carry }) => guard(async () => {
            const id = await createVersion({ sessionId: session.id, reason, drawingRevisionId: revisionId, rulesetVersionId, carryItemIds: carry });
            setDialog(null);
            setVersionId(id);
            setSelectedItemId(null);
            await loadBundle();
          }, "New version created")}
        />
      )}
    </div>
  );
}

function lookups(wbs: { id: string; wbs_code: string | null }[], codes: { id: string; code: string }[]) {
  return {
    wbsCodes: Object.fromEntries(wbs.map((w) => [w.id, w.wbs_code ?? w.id])),
    budgetCodes: Object.fromEntries(codes.map((c) => [c.id, c.code])),
  };
}

export function ChangesTable({ rows }: { rows: ChangeRow[] }) {
  const summary = summarizeChanges(rows);
  if (rows.length === 0) return <p className="text-muted-foreground">No items in either version.</p>;
  return (
    <div>
      <p className="mb-1 text-muted-foreground">
        {(Object.entries(summary) as [keyof typeof summary, number][]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${CHANGE_LABEL[k].toLowerCase()}`).join(" · ")}
      </p>
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">Item</th><th>Change</th><th>Description</th><th className="text-right">Previous</th><th className="text-right">New</th><th className="text-right">Variance</th><th className="text-right">%</th><th>Source</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key + r.kind} className={cn("border-t border-border", r.kind === "unchanged" && "text-muted-foreground")}>
              <td className="py-1 font-mono">{r.key}</td>
              <td>
                <Badge variant={r.kind === "unresolved" ? "destructive" : "outline"}>{CHANGE_LABEL[r.kind]}</Badge>
                {r.also.map((a) => <span key={a} className="ml-1 text-[10px] text-muted-foreground">+{CHANGE_LABEL[a].toLowerCase()}</span>)}
              </td>
              <td className="max-w-[240px] truncate">{(r.current ?? r.previous)?.description}</td>
              <td className="text-right tabular-nums">{r.previousQty ?? "—"}</td>
              <td className="text-right tabular-nums">{r.currentQty ?? "—"} {(r.current ?? r.previous)?.unit}</td>
              <td className={cn("text-right tabular-nums", r.variance?.startsWith("-") ? "text-red-700 dark:text-red-300" : r.variance && r.variance !== "0" ? "text-emerald-700 dark:text-emerald-300" : "")}>
                {r.unitChanged ? "unit changed" : r.variance && r.variance !== "0" && !r.variance.startsWith("-") ? `+${r.variance}` : r.variance}
              </td>
              <td className="text-right tabular-nums">{r.variancePct === null ? "—" : `${r.variancePct.startsWith("-") ? "" : "+"}${r.variancePct}%`}</td>
              <td className="text-muted-foreground">{r.also.includes("source_changed") || r.kind === "source_changed" ? "revised" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
