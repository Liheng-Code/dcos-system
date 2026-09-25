"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, ImageUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BOQ_UNITS } from "@/lib/boq-units";
import type { BudgetCode } from "@/lib/tender-cost-service";
import type { AiBoqDraftResponse, AiBoqDraftResponseLine } from "@/lib/ai-boq-draft-schema";
import {
  acceptAiBoqLines,
  listTenderDrawingRevisions,
  parsePageList,
  runAiBoqDraftFromDrawing,
  runAiBoqDraftFromImage,
  AiDraftError,
  type TenderDrawingRevisionOption,
} from "@/lib/tender-ai-boq-draft";

interface Props {
  tenderId: string;
  budgetCodes: BudgetCode[];
  onClose: () => void;
  onAccepted: () => void;
}

interface ReviewRow {
  include: boolean;
  description: string;
  unit: string;
  quantity: string;
  section: string;
  budgetCodeId: string;
  matchId: string;
  expanded: boolean;
  source: AiBoqDraftResponseLine;
}

const CONFIDENCE_CLASS: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-red-50 text-red-700",
};

function toRow(line: AiBoqDraftResponseLine): ReviewRow {
  const best = line.matches.find((m) => m.source_type === "element_description") ?? null;
  return {
    // Low-confidence and unmeasurable lines start unticked; the QS opts them in.
    include: line.confidence !== "low" && line.quantity != null,
    description: line.description,
    unit: line.unit,
    quantity: line.quantity != null ? String(line.quantity) : "",
    section: line.suggested_section,
    budgetCodeId: best?.budget_code_id ?? "",
    matchId: "",
    expanded: false,
    source: line,
  };
}

// Mounted only while open (see boq-tab.tsx), so state starts fresh each time.
export function AiBoqDraftDialog({ tenderId, budgetCodes, onClose, onAccepted }: Props) {
  const [mode, setMode] = useState<"drawing" | "image">("drawing");
  const [revisions, setRevisions] = useState<TenderDrawingRevisionOption[] | null>(null);
  const [revisionId, setRevisionId] = useState("");
  const [pagesText, setPagesText] = useState("1");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState<AiBoqDraftResponse | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTenderDrawingRevisions(tenderId)
      .then((list) => { if (!cancelled) setRevisions(list); })
      .catch((e) => { if (!cancelled) { setRevisions([]); toast.error(e instanceof Error ? e.message : "Failed to load drawings"); } });
    return () => { cancelled = true; };
  }, [tenderId]);

  const pdfRevisions = useMemo(() => (revisions ?? []).filter((r) => r.hasPdf), [revisions]);
  const parsedPages = parsePageList(pagesText);
  const canRun = !running && (mode === "drawing" ? !!revisionId && !!parsedPages && parsedPages.length > 0 : !!imageFile);

  async function handleRun() {
    setRunning(true);
    try {
      const result = mode === "drawing"
        ? await runAiBoqDraftFromDrawing(tenderId, { drawingRevisionId: revisionId, pages: parsedPages ?? [], instructions })
        : await runAiBoqDraftFromImage(tenderId, imageFile!, instructions);
      setDraft(result);
      setRows(result.lines.map(toRow));
      if (result.lines.length === 0) toast.message("The AI found nothing to measure on this drawing.");
    } catch (e) {
      const notConfigured = e instanceof AiDraftError && e.code === "NOT_CONFIGURED";
      toast.error(e instanceof Error ? e.message : "AI drafting failed", {
        description: notConfigured ? "An administrator needs to set ANTHROPIC_API_KEY on the server." : undefined,
      });
    } finally {
      setRunning(false);
    }
  }

  function updateRow(i: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function chooseMatch(i: number, matchId: string) {
    const row = rows[i];
    const match = row.source.matches.find((m) => m.source_id === matchId);
    updateRow(i, {
      matchId,
      // A library match fills the budget code only when the QS hasn't picked one.
      budgetCodeId: row.budgetCodeId || match?.budget_code_id || "",
    });
  }

  const included = rows.filter((r) => r.include);
  const invalidIncluded = included.filter((r) => !r.budgetCodeId || r.quantity.trim() === "" || !(Number(r.quantity) >= 0) || !r.description.trim());

  async function handleAccept() {
    if (!draft) return;
    setAccepting(true);
    try {
      const codeById = new Map(budgetCodes.map((c) => [c.id, c.code]));
      const created = await acceptAiBoqLines(
        tenderId,
        draft.draftId,
        included.map((r) => {
          const match = r.source.matches.find((m) => m.source_id === r.matchId);
          return {
            description: r.description,
            unit: r.unit,
            quantity: Number(r.quantity),
            section: r.section,
            discipline: r.source.discipline || null,
            budgetCodeId: r.budgetCodeId,
            budgetCode: codeById.get(r.budgetCodeId) ?? "MISC",
            laborNetCost: match?.labor_rate ?? 0,
            materialNetCost: match?.material_rate ?? 0,
            quantityBasis: r.source.quantity_basis,
            assumptions: r.source.assumptions,
          };
        }),
      );
      toast.success(`${created} BOQ item${created !== 1 ? "s" : ""} added from the AI draft`);
      onAccepted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add the accepted lines");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !running && !accepting) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Draft from Drawing</DialogTitle>
          <DialogDescription>
            Claude reads the drawing and proposes BOQ lines. Nothing is added until you review and accept the lines you want.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-4">
            <div className="flex gap-1">
              <Button size="sm" variant={mode === "drawing" ? "default" : "outline"} onClick={() => setMode("drawing")} disabled={running}>Tender drawing</Button>
              <Button size="sm" variant={mode === "image" ? "default" : "outline"} onClick={() => setMode("image")} disabled={running}>
                <ImageUp className="mr-1 h-4 w-4" /> Upload image
              </Button>
            </div>

            {mode === "drawing" ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <p className="text-xs font-medium">Drawing (current revision, PDF)</p>
                  {revisions === null ? (
                    <div className="flex h-9 items-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : pdfRevisions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No current PDF drawings are registered for this tender. Add them under Quantity Take-off › Drawings, or upload an image.</p>
                  ) : (
                    <select value={revisionId} onChange={(e) => setRevisionId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="">Select a drawing…</option>
                      {pdfRevisions.map((r) => (
                        <option key={r.revisionId} value={r.revisionId}>{r.drawingNo} rev {r.revision} — {r.title}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium">Pages (max 20)</p>
                  <Input value={pagesText} onChange={(e) => setPagesText(e.target.value)} placeholder="e.g. 1, 3-4" />
                  {!parsedPages && <p className="text-[11px] text-red-600">Use numbers and ranges, e.g. 1, 3-4</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium">Image (PNG or JPEG, up to 5 MB)</p>
                <input type="file" accept="image/png,image/jpeg" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} className="text-sm" />
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium">Instructions (optional)</p>
              <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Measure external walls and openings only" />
            </div>

            <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The selected pages are sent to Anthropic&apos;s Claude API for processing. Each run has a small usage cost, which is logged. A run can take one to three minutes.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="space-y-1 text-sm">
              <p>{draft.drawingSummary}</p>
              {draft.warnings.length > 0 && (
                <ul className="space-y-0.5 text-xs text-amber-700">
                  {draft.warnings.map((w, i) => <li key={i} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                {rows.length} proposed line{rows.length !== 1 ? "s" : ""} · {included.length} selected · tokens in {draft.usage.inputTokens.toLocaleString()} / out {draft.usage.outputTokens.toLocaleString()}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Description</TableHead>
                    <TableHead className="w-20">Unit</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-24">Confidence</TableHead>
                    <TableHead className="w-56">Library match (prices the line)</TableHead>
                    <TableHead className="w-48">Budget code *</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <FragmentRow key={i}>
                      <TableRow className={cn(!r.include && "opacity-60")}>
                        <TableCell className="align-top">
                          <input type="checkbox" checked={r.include} onChange={(e) => updateRow(i, { include: e.target.checked })} />
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-start gap-1">
                            <button type="button" onClick={() => updateRow(i, { expanded: !r.expanded })} className="mt-1.5 text-muted-foreground" title="Show basis and assumptions">
                              {r.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            <Input value={r.description} onChange={(e) => updateRow(i, { description: e.target.value })} className="h-8 text-xs" />
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <select value={r.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} className="h-8 w-full rounded border border-border bg-background px-1 text-xs">
                            {BOQ_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </TableCell>
                        <TableCell className="align-top">
                          <Input value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} placeholder="—" inputMode="decimal" className="h-8 text-xs" />
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge className={cn("text-[10px]", CONFIDENCE_CLASS[r.source.confidence])} variant="outline">{r.source.confidence}</Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          <select value={r.matchId} onChange={(e) => chooseMatch(i, e.target.value)} className="h-8 w-full rounded border border-border bg-background px-1 text-xs">
                            <option value="">No match — price later</option>
                            {r.source.matches.map((m) => (
                              <option key={m.source_id} value={m.source_id}>
                                {m.title}{m.material_rate || m.labor_rate ? ` (M ${m.material_rate ?? 0} / L ${m.labor_rate ?? 0})` : ""}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="align-top">
                          <select value={r.budgetCodeId} onChange={(e) => updateRow(i, { budgetCodeId: e.target.value })} className={cn("h-8 w-full rounded border bg-background px-1 text-xs", r.include && !r.budgetCodeId ? "border-red-400" : "border-border")}>
                            <option value="">Select…</option>
                            {budgetCodes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.description}</option>)}
                          </select>
                        </TableCell>
                      </TableRow>
                      {r.expanded && (
                        <TableRow className="bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={6} className="space-y-0.5 py-2 text-[11px] text-muted-foreground">
                            <p><span className="font-medium text-foreground">Basis:</span> {r.source.quantity_basis || "—"}</p>
                            <p><span className="font-medium text-foreground">Location:</span> {r.source.location_on_drawing || "—"}</p>
                            <p><span className="font-medium text-foreground">Assumptions:</span> {r.source.assumptions || "—"}</p>
                            <p><span className="font-medium text-foreground">Section:</span>{" "}
                              <input value={r.section} onChange={(e) => updateRow(i, { section: e.target.value })} className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px]" />
                              {r.source.discipline ? ` · ${r.source.discipline}` : ""}
                            </p>
                          </TableCell>
                        </TableRow>
                      )}
                    </FragmentRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running || accepting}>Cancel</Button>
          {!draft ? (
            <Button onClick={() => void handleRun()} disabled={!canRun}>
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {running ? "Reading drawing…" : "Draft BOQ lines"}
            </Button>
          ) : (
            <Button
              onClick={() => void handleAccept()}
              disabled={accepting || included.length === 0 || invalidIncluded.length > 0}
              title={invalidIncluded.length > 0 ? "Every selected line needs a description, a quantity and a budget code" : undefined}
            >
              {accepting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Add {included.length} line{included.length !== 1 ? "s" : ""} to BOQ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
