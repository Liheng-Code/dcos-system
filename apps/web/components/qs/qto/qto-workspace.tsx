"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Ruler,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  QTO_STATUSES,
  QTO_STATUS_TRANSITIONS,
  addCalculation,
  addCalculationLine,
  addMeasurement,
  changeStatus,
  createRevision,
  deleteCalculationLine,
  deleteMeasurement,
  getDrawingUrl,
  getQtoItem,
  listDrawings,
  listCalculationLines,
  safeEvaluate,
  updateQtoItem,
  type QtoCalculationLine,
  type QtoDrawing,
  type QtoDrawingRevision,
  type QtoItemDetail,
  type QtoMeasurement,
} from "@/lib/qs/qto-service";
import { DrawingViewer, type Calibration, type EmittedMeasurement } from "@/components/qs/qto/drawing-viewer";

type Tab = "measure" | "details" | "calc" | "review" | "history";

const TABS: { key: Tab; label: string; icon: typeof Ruler }[] = [
  { key: "measure", label: "Measure", icon: Ruler },
  { key: "details", label: "Details", icon: FileText },
  { key: "calc", label: "Calculations", icon: ClipboardList },
  { key: "review", label: "Review", icon: Check },
  { key: "history", label: "History", icon: History },
];

interface PendingMeasurement extends EmittedMeasurement {
  label?: string;
}

const MEASURE_LABELS: Record<string, string> = {
  point: "point",
  length: "length",
  polyline: "length",
  area: "area",
  perimeter: "perimeter",
  count: "count",
};

export function QtoWorkspace({ itemId }: { itemId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("measure");

  const [item, setItem] = useState<QtoItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [drawings, setDrawings] = useState<QtoDrawing[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<QtoDrawing | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<QtoDrawingRevision | null>(null);
  const [drawingUrl, setDrawingUrl] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);

  const [pending, setPending] = useState<PendingMeasurement | null>(null);
  const [savingMeasure, setSavingMeasure] = useState(false);

  const [calcLines, setCalcLines] = useState<QtoCalculationLine[]>([]);
  const [calcForm, setCalcForm] = useState({ formula: "", display_text: "" });
  const [lineForm, setLineForm] = useState<{ sign: string; description: string; amount: string; unit: string; source: string }>({
    sign: "+",
    description: "",
    amount: "",
    unit: "m",
    source: "measure",
  });

  const [actionComment, setActionComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await getQtoItem(itemId);
    if (res.error) {
      setLoadError(res.error);
      setLoading(false);
      return;
    }
    setItem(res.data);
    setLoading(false);
    setCalibration(null);
  }, [itemId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, [load, supabase]);

  useEffect(() => {
    if (!item?.tender_id) return;
    void listDrawings(item.tender_id).then((res) => {
      if (res.data) setDrawings(res.data);
    });
  }, [item?.tender_id]);

  // Pick the drawing + revision referenced by the item (or first available)
  useEffect(() => {
    if (!item || drawings.length === 0) return;
    const linked = drawings.find((d) => d.id === item.drawing_id) ?? drawings[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDrawing(linked);
    const rev = linked.current_revision ?? null;
    setSelectedRevision(rev);
    setDrawingUrl(getDrawingUrl(rev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.drawing_id, drawings]);

  useEffect(() => {
    if (selectedDrawing && !selectedRevision) {
      const rev = selectedDrawing.current_revision ?? null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedRevision(rev);
      setDrawingUrl(getDrawingUrl(rev));
    }
  }, [selectedDrawing, selectedRevision]);

  const attachDrawing = async (drawingId: string, revisionId: string) => {
    if (!item) return;
    const res = await updateQtoItem(item.id, {
      drawing_id: drawingId,
      drawing_revision_id: revisionId,
      page_no: item.page_no ?? 1,
    });
    if (res.error) toast.error(res.error);
    else void load();
  };

  async function handleMeasureSaved(label?: string) {
    if (!pending || !item) return;
    setSavingMeasure(true);
    const res = await addMeasurement(item.id, {
      drawing_id: item.drawing_id,
      drawing_revision_id: item.drawing_revision_id,
      page_no: pending.page_no,
      measure_type: pending.measure_type,
      points: pending.points,
      length: pending.length,
      area: pending.area,
      count: pending.count,
      unit: pending.unit,
      scale_calibration: calibration,
      label: label ?? null,
    });
    setSavingMeasure(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Measurement saved");
    setPending(null);
    void load();
  }

  async function handleDeleteMeasurement(m: QtoMeasurement) {
    const res = await deleteMeasurement(m.id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Measurement deleted");
      void load();
    }
  }

  const transitions = item ? (QTO_STATUS_TRANSITIONS[item.status] ?? []) : [];

  async function handleTransition(to: string) {
    if (!item) return;
    setBusy(true);
    const res = await changeStatus(item.id, to as QtoItemDetail["status"], {
      comment: actionComment || undefined,
      actorId: userId,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Status → ${to}`);
    setActionComment("");
    void load();
  }

  async function handleCreateRevision() {
    if (!item) return;
    if (!revisionReason.trim()) {
      toast.error("A change reason is required");
      return;
    }
    setBusy(true);
    const res = await createRevision(item.id, revisionReason.trim());
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("New revision created");
    setRevisionReason("");
    void load();
  }

  // ── Calculations ──────────────────────────────────────────────────────────
  const loadCalcLines = useCallback(async (calcId: string) => {
    const lines = await listCalculationLines(calcId);
    setCalcLines(lines);
  }, []);

  useEffect(() => {
    if (tab === "calc" && item && item.calculations.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadCalcLines(item.calculations[0].id);
    }
  }, [tab, item, loadCalcLines]);

  async function handleAddCalculation() {
    if (!item) return;
    const res = await addCalculation(item.id, {
      formula: calcForm.formula,
      display_text: calcForm.display_text || undefined,
    });
    if (res.error) toast.error(res.error);
    else {
      toast.success("Calculation added");
      setCalcForm({ formula: "", display_text: "" });
      void load();
      if (res.data) void loadCalcLines(res.data.id);
    }
  }

  async function handleAddLine(calcId: string) {
    const amount = parseFloat(lineForm.amount);
    if (isNaN(amount)) {
      toast.error("Enter a valid amount");
      return;
    }
    const res = await addCalculationLine(calcId, {
      seq: calcLines.length + 1,
      sign: lineForm.sign,
      description: lineForm.description || undefined,
      amount,
      unit: lineForm.unit || undefined,
      source: lineForm.source,
    });
    if (res.error) toast.error(res.error);
    else {
      toast.success("Line added");
      setLineForm({ sign: "+", description: "", amount: "", unit: "m", source: "measure" });
      void loadCalcLines(calcId);
      void load();
    }
  }

  async function handleDeleteLine(line: QtoCalculationLine) {
    const res = await deleteCalculationLine(line.id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Line deleted");
      if (item?.calculations[0]) void loadCalcLines(item.calculations[0].id);
      void load();
    }
  }

  const calcTotal = useMemo(
    () => calcLines.reduce((acc, l) => acc + (l.sign === "-" ? -l.amount : l.amount), 0),
    [calcLines]
  );

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (loadError || !item) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{loadError ?? "QTO item not found"}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/qto")}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to QTO
        </Button>
      </div>
    );
  }

  const isLocked = item.is_locked || item.status === "APPROVED" || item.status === "POSTED TO BOQ";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/qto")}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-lg font-semibold">{item.qto_no}</h1>
            <Badge variant={item.status === "APPROVED" || item.status === "POSTED TO BOQ" ? "default" : "outline"}>{item.status}</Badge>
            <Badge variant="secondary">Rev {item.revision_no}</Badge>
            {item.confidence && <Badge variant="outline">{item.confidence}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {item.building ?? "—"} · {item.discipline ?? "—"} · {item.work_section ?? "—"}
            {item.drawing?.drawing_no ? ` · Drawing ${item.drawing.drawing_no}` : ""}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[11px] text-muted-foreground">Net Quantity ({item.unit})</p>
          <p className="text-2xl font-semibold tabular-nums">{item.quantity.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Measurements ─────────────────────────────────────────────────── */}
      {tab === "measure" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <label className="text-xs font-medium text-muted-foreground">Drawing:</label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={selectedDrawing?.id ?? ""}
                onChange={(e) => {
                  const d = drawings.find((x) => x.id === e.target.value) ?? null;
                  setSelectedDrawing(d);
                  setSelectedRevision(d?.current_revision ?? null);
                  setDrawingUrl(getDrawingUrl(d?.current_revision));
                }}
              >
                {drawings.length === 0 && <option value="">No drawings</option>}
                {drawings.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.drawing_no} — {d.title}
                  </option>
                ))}
              </select>
              {selectedDrawing && (
                <div className="flex items-center gap-1">
                  <select
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    value={selectedRevision?.id ?? ""}
                    onChange={async (e) => {
                      const revId = e.target.value;
                      const rev = selectedDrawing.current_revision?.id === revId
                        ? selectedDrawing.current_revision
                        : null;
                      setSelectedRevision(rev);
                      setDrawingUrl(getDrawingUrl(rev));
                      if (item && rev) {
                        await attachDrawing(selectedDrawing.id, rev.id);
                      }
                    }}
                  >
                    {selectedDrawing.current_revision && (
                      <option value={selectedDrawing.current_revision.id}>
                        Rev {selectedDrawing.current_revision.revision} (current)
                      </option>
                    )}
                  </select>
                </div>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {selectedRevision ? `Rev ${selectedRevision.revision} · ${selectedRevision.scale ?? "no scale"}` : "No PDF available"}
              </span>
            </div>
            <div className="h-[60vh]">
              <DrawingViewer
                url={drawingUrl ?? ""}
                calibration={calibration}
                onCalibrationChange={setCalibration}
                onMeasure={(m) => setPending({ ...m })}
                savedMeasurements={item.measurements}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {pending ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Save measurement</p>
                </div>
                <div className="mb-3 space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Type:</span>{" "}
                    <span className="font-medium uppercase">{MEASURE_LABELS[pending.measure_type]}</span>
                  </p>
                  {pending.length !== null && (
                    <p><span className="text-muted-foreground">Length:</span> {pending.length} {pending.unit}</p>
                  )}
                  {pending.area !== null && (
                    <p><span className="text-muted-foreground">Area:</span> {pending.area} {pending.unit}²</p>
                  )}
                  {pending.count !== null && (
                    <p><span className="text-muted-foreground">Count:</span> {pending.count}</p>
                  )}
                  {!calibration && (
                    <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      Set the drawing scale (toolbar → Scale) before measuring to get real units.
                    </p>
                  )}
                </div>
                <input
                  className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Label (e.g. Wall 12 / grid A1-B2)"
                  value={pending.label ?? ""}
                  onChange={(e) => setPending((p) => (p ? { ...p, label: e.target.value } : p))}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={savingMeasure} onClick={() => void handleMeasureSaved(pending.label)}>
                    {savingMeasure && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Discard</Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">How to measure</p>
                <ol className="list-inside list-decimal space-y-1 text-xs">
                  <li>Pick a drawing above (attach it to this item).</li>
                  <li>Set the scale: toolbar → <b>Scale</b>, click two points of a known dimension, e.g. a 1200mm grid.</li>
                  <li>Use Length / Area / Count tools to measure directly on the plan.</li>
                  <li>Save each measurement — it becomes a line in your calculations.</li>
                </ol>
              </div>
            )}

            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium">Measurements ({item.measurements.length})</p>
              </div>
              <div className="max-h-[40vh] divide-y divide-border overflow-y-auto">
                {item.measurements.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">No measurements saved yet.</p>
                )}
                {item.measurements.map((m) => {
                  const pts = (m.points ?? []) as { x: number; y: number }[];
                  return (
                    <div key={m.id} className="flex items-start justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          {m.label ?? <span className="text-muted-foreground">(untitled)</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          <span className="uppercase">{m.measure_type}</span>
                          {m.length !== null && <> · {m.length} {m.unit}</>}
                          {m.area !== null && <> · {m.area} {m.unit}²</>}
                          {m.count !== null && <> · {m.count} No.</>}
                          {m.page_no != null && <> · p{m.page_no}</>}
                          <span className="ml-1">· {pts.length} pt{pts.length === 1 ? "" : "s"}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => void handleDeleteMeasurement(m)}
                        disabled={isLocked}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        title="Delete measurement"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Details ──────────────────────────────────────────────────────── */}
      {tab === "details" && <DetailsPanel item={item} isLocked={isLocked} onSaved={() => void load()} />}

      {/* ── Calculations ─────────────────────────────────────────────────── */}
      {tab === "calc" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 text-sm font-medium">Formula</p>
            {item.calculations.length === 0 && (
              <p className="mb-3 text-xs text-muted-foreground">No calculation yet — the net quantity is entered manually.</p>
            )}
            <input
              className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              placeholder="e.g. 2.40*2.40*0.80*12"
              value={calcForm.formula}
              onChange={(e) => setCalcForm((f) => ({ ...f, formula: e.target.value }))}
            />
            <input
              className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Display text (optional)"
              value={calcForm.display_text}
              onChange={(e) => setCalcForm((f) => ({ ...f, display_text: e.target.value }))}
            />
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Preview:</span>
              <span className="font-mono font-medium">
                {(() => {
                  if (!calcForm.formula.trim()) return "—";
                  const r = safeEvaluate(calcForm.formula);
                  return r.ok ? r.value : "invalid";
                })()}
              </span>
            </div>
            <Button size="sm" onClick={() => void handleAddCalculation()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Calculation
            </Button>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Add / Deduct Lines</p>
              {item.calculations.length > 0 && (
                <span className="text-xs text-muted-foreground">of {item.calculations[0].formula}</span>
              )}
            </div>
            {item.calculations.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add a calculation first, then break it into measurable lines.</p>
            ) : (
              <>
                <div className="mb-2 grid grid-cols-[70px_1fr_90px_70px_110px] gap-2 text-xs">
                  <select
                    className="rounded-md border border-border bg-background px-2 py-1.5"
                    value={lineForm.sign}
                    onChange={(e) => setLineForm((f) => ({ ...f, sign: e.target.value }))}
                  >
                    <option value="+">+ Add</option>
                    <option value="-">− Deduct</option>
                  </select>
                  <input
                    className="rounded-md border border-border bg-background px-2 py-1.5"
                    placeholder="Description"
                    value={lineForm.description}
                    onChange={(e) => setLineForm((f) => ({ ...f, description: e.target.value }))}
                  />
                  <input
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-right"
                    placeholder="Amount"
                    type="number"
                    value={lineForm.amount}
                    onChange={(e) => setLineForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                  <input
                    className="rounded-md border border-border bg-background px-2 py-1.5"
                    placeholder="Unit"
                    value={lineForm.unit}
                    onChange={(e) => setLineForm((f) => ({ ...f, unit: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" onClick={() => void handleAddLine(item.calculations[0].id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Line
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 w-10">Seq</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 w-10">Sign</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 w-16">Unit</th>
                        <th className="px-3 py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {calcLines.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                            No lines yet — the quantity equals the formula result.
                          </td>
                        </tr>
                      )}
                      {calcLines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2 font-mono text-xs">{l.seq}</td>
                          <td className="px-3 py-2 text-xs">{l.description ?? <span className="text-muted-foreground italic">(no description)</span>}</td>
                          <td className={cn("px-3 py-2 text-center font-semibold", l.sign === "-" ? "text-red-600" : "text-emerald-600")}>{l.sign}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{l.amount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs">{l.unit ?? "—"}</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => void handleDeleteLine(l)}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {calcLines.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-border">
                          <td colSpan={3} className="px-3 py-2 text-xs font-medium">Net</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">{calcTotal.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs">{item.unit}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  Item net quantity: <span className="font-mono font-medium">{item.quantity.toLocaleString()} {item.unit}</span>
                  {Math.abs(calcTotal - item.quantity) > 0.001 && calcLines.length > 0 && (
                    <span className="ml-2 text-amber-600">(differs from item quantity)</span>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Review ───────────────────────────────────────────────────────── */}
      {tab === "review" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 text-sm font-medium">Status Workflow</p>
            <div className="mb-4 flex flex-wrap items-center gap-1">
              {QTO_STATUSES.map((s, i) => {
                const idx = QTO_STATUSES.indexOf(item.status);
                const reached = i <= idx;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <Badge variant={reached ? "default" : "outline"} className={cn(reached && i === idx && "bg-primary")}>
                      {s}
                    </Badge>
                    {i < QTO_STATUSES.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
                  </div>
                );
              })}
            </div>

            {item.is_locked && (
              <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                This item is locked ({item.status}). Create a revision to unlock and remeasure.
              </p>
            )}

            <div className="mb-2 flex flex-wrap gap-2">
              {transitions.length === 0 && <p className="text-xs text-muted-foreground">No further transitions allowed.</p>}
              {transitions.map((to) => (
                <Button
                  key={to}
                  size="sm"
                  variant={to === "APPROVED" || to === "QS CHECKED" ? "default" : "outline"}
                  disabled={busy || (to === "APPROVED" && item.prepared_by === userId)}
                  title={to === "APPROVED" && item.prepared_by === userId ? "Preparer cannot approve their own QTO" : undefined}
                  onClick={() => void handleTransition(to)}
                >
                  {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  → {to}
                </Button>
              ))}
            </div>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              rows={2}
              placeholder="Comment for the reviewer (optional)"
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
            />

            <div className="mt-6 border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium">Start a new revision</p>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Change reason (required)"
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleCreateRevision()}>
                  <History className="mr-1 h-3.5 w-3.5" /> Rev {item.revision_no + 1}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium">Review Timeline</p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {item.reviews.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">No review activity yet.</p>
              )}
              {[...item.reviews].reverse().map((r) => (
                <div key={r.id} className="border-b border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="uppercase">{r.decision}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {r.from_status ?? "—"} → {r.to_status ?? "—"}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1 text-xs">{r.comment}</p>}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── History ──────────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-medium">Revision History</p>
          </div>
          <div className="divide-y divide-border">
            {item.history.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No revisions yet — this is the original take-off.</p>
            )}
            {[...item.history].reverse().map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Rev {h.revision_no}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  {h.change_reason && <p className="mt-1 text-xs">{h.change_reason}</p>}
                </div>
                <div className="text-right text-xs">
                  <p className="tabular-nums">{h.quantity?.toLocaleString()} {h.unit}</p>
                  <p className="text-muted-foreground">{h.status ?? "—"}</p>
                </div>
              </div>
            ))}
            <div className="flex items-start justify-between gap-3 bg-muted/30 px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <Badge>Rev {item.revision_no}</Badge>
                  <span className="text-xs text-muted-foreground">current</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Current working revision</p>
              </div>
              <div className="text-right text-xs">
                <p className="tabular-nums font-semibold">{item.quantity.toLocaleString()} {item.unit}</p>
                <p className="text-muted-foreground">{item.status}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Details panel ─────────────────────────────────────────────────────────────
function DetailsPanel({
  item,
  isLocked,
  onSaved,
}: {
  item: QtoItemDetail;
  isLocked: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    building: item.building ?? "",
    discipline: item.discipline ?? "",
    work_section: item.work_section ?? "",
    element: item.element ?? "",
    item_code: item.item_code ?? "",
    description: item.description,
    unit: item.unit,
    quantity: String(item.quantity),
    grid_location: item.grid_location ?? "",
    detail_ref: item.detail_ref ?? "",
    specification_ref: item.specification_ref ?? "",
    assumption: item.assumption ?? "",
    remarks: item.remarks ?? "",
  }));
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const labelCls = "text-xs font-medium text-muted-foreground";

  async function save() {
    setSaving(true);
    const res = await updateQtoItem(item.id, {
      building: form.building || null,
      discipline: form.discipline || null,
      work_section: form.work_section || null,
      element: form.element || null,
      item_code: form.item_code || null,
      description: form.description,
      unit: form.unit,
      quantity: parseFloat(form.quantity) || 0,
      grid_location: form.grid_location || null,
      detail_ref: form.detail_ref || null,
      specification_ref: form.specification_ref || null,
      assumption: form.assumption || null,
      remarks: form.remarks || null,
    });
    setSaving(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Details saved");
      onSaved();
    }
  }

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className={labelCls}>Building</label>
        <input className={inputCls} disabled={isLocked} value={form.building} onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Discipline</label>
        <input className={inputCls} disabled={isLocked} value={form.discipline} onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Work Section</label>
        <input className={inputCls} disabled={isLocked} value={form.work_section} onChange={(e) => setForm((f) => ({ ...f, work_section: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Element</label>
        <input className={inputCls} disabled={isLocked} value={form.element} onChange={(e) => setForm((f) => ({ ...f, element: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Item Code</label>
        <input className={inputCls} disabled={isLocked} value={form.item_code} onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Unit</label>
        <input className={inputCls} disabled={isLocked} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <label className={labelCls}>Description</label>
        <textarea className={inputCls} rows={2} disabled={isLocked} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Quantity ({form.unit})</label>
        <input className={inputCls} type="number" step="0.001" disabled={isLocked} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Grid Location</label>
        <input className={inputCls} disabled={isLocked} value={form.grid_location} onChange={(e) => setForm((f) => ({ ...f, grid_location: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Detail Ref</label>
        <input className={inputCls} disabled={isLocked} value={form.detail_ref} onChange={(e) => setForm((f) => ({ ...f, detail_ref: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Specification Ref</label>
        <input className={inputCls} disabled={isLocked} value={form.specification_ref} onChange={(e) => setForm((f) => ({ ...f, specification_ref: e.target.value }))} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <label className={labelCls}>Assumption</label>
        <textarea className={inputCls} rows={2} disabled={isLocked} value={form.assumption} onChange={(e) => setForm((f) => ({ ...f, assumption: e.target.value }))} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <label className={labelCls}>Remarks</label>
        <textarea className={inputCls} rows={2} disabled={isLocked} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" onClick={() => void save()} disabled={isLocked || saving}>
          {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          <Pencil className="mr-1 h-3.5 w-3.5" /> Save Details
        </Button>
        {isLocked && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Minus className="h-3 w-3" /> Locked in {item.status} — create a revision to edit.
          </p>
        )}
      </div>
    </div>
  );
}
