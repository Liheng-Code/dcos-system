"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildExportRows, toCsv, toSheetRows, type ExportLookups } from "@/lib/qs/qto/export";
import {
  logExport, newIdempotencyKey, transferToTenderBoq,
} from "@/lib/qs/qto/session-service";
import type { QtoPublication, QtoTransfer, TakeoffItem } from "@/lib/qs/qto/types";
import { VERSION_STATUS_LABEL, type VersionStatus } from "@/lib/qs/qto/workflow";
import type { QtoDrawing, QtoDrawingRevision } from "@/lib/qs/qto-service";

const fieldCls = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// ── Calibration ─────────────────────────────────────────────────────────────

export function CalibrationDialog({ pageUnits, onCancel, onSave }: {
  pageUnits: number;
  onCancel: () => void;
  onSave: (knownDistance: number, unit: "mm" | "cm" | "m") => Promise<void>;
}) {
  const [distanceText, setDistanceText] = useState("");
  const [unit, setUnit] = useState<"mm" | "cm" | "m">("mm");
  const [saving, setSaving] = useState(false);
  const known = Number(distanceText);
  const valid = Number.isFinite(known) && known > 0;
  const perUnit = valid ? (known * { mm: 1, cm: 10, m: 1000 }[unit]) / pageUnits : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set the drawing scale</DialogTitle>
          <DialogDescription>
            Enter the real length of the dimension you picked ({pageUnits.toFixed(1)} page units). The scale applies to this drawing revision and page; earlier scales are kept in the history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Input autoFocus inputMode="decimal" placeholder="Known distance, e.g. 6000" value={distanceText} onChange={(e) => setDistanceText(e.target.value)} />
          <select className={fieldCls} value={unit} onChange={(e) => setUnit(e.target.value as "mm" | "cm" | "m")}>
            <option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
          </select>
        </div>
        {perUnit !== null && <p className="text-xs text-muted-foreground">1 page unit = {perUnit.toFixed(4)} mm</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!valid || saving} onClick={async () => {
            setSaving(true);
            try { await onSave(known, unit); } finally { setSaving(false); }
          }}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save scale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Workflow transition with a comment ──────────────────────────────────────

export function TransitionDialog({ to, commentRequired, onCancel, onConfirm }: {
  to: VersionStatus;
  commentRequired: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const titles: Partial<Record<VersionStatus, string>> = {
    SUBMITTED_FOR_REVIEW: "Submit for review",
    APPROVED: "Approve this version",
    CHANGES_REQUESTED: "Request changes",
    CANCELLED: "Cancel this version",
    IN_PROGRESS: "Start / resume work",
  };
  const notes: Partial<Record<VersionStatus, string>> = {
    SUBMITTED_FOR_REVIEW: "The version becomes read-only while it is reviewed. Blocking issues must be fixed first; the server checks again.",
    APPROVED: "Approval does not publish. A reviewer cannot approve a version they submitted.",
    CHANGES_REQUESTED: "Say what needs to change. The version returns to the preparer and the decision stays in the history.",
    CANCELLED: "Cancelling is permanent and audited. Its published predecessors stay valid.",
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[to] ?? VERSION_STATUS_LABEL[to]}</DialogTitle>
          {notes[to] && <DialogDescription>{notes[to]}</DialogDescription>}
        </DialogHeader>
        <textarea className="min-h-[90px] w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
          placeholder={commentRequired ? "Comment (required)" : "Comment (optional)"} value={comment} onChange={(e) => setComment(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Back</Button>
          <Button variant={to === "CANCELLED" ? "destructive" : "default"} disabled={busy || (commentRequired && !comment.trim())}
            onClick={async () => { setBusy(true); try { await onConfirm(comment); } finally { setBusy(false); } }}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {titles[to] ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New version ─────────────────────────────────────────────────────────────

export function NewVersionDialog({ items, drawings, revisionsByDrawing, currentRevisionId, rulesetVersions, currentRulesetVersionId, onCancel, onCreate }: {
  items: TakeoffItem[];
  drawings: QtoDrawing[];
  revisionsByDrawing: Record<string, QtoDrawingRevision[]>;
  currentRevisionId: string | null;
  rulesetVersions: { id: string; label: string }[];
  currentRulesetVersionId: string | null;
  onCancel: () => void;
  onCreate: (args: { reason: string; revisionId: string; rulesetVersionId: string; carry: string[] }) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [revisionId, setRevisionId] = useState(currentRevisionId ?? "");
  const [rulesetVersionId, setRulesetVersionId] = useState(currentRulesetVersionId ?? rulesetVersions[0]?.id ?? "");
  const [carry, setCarry] = useState<Set<string>>(new Set(items.map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setCarry((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start a new version</DialogTitle>
          <DialogDescription>
            The current version stays as it is. Carried items keep a link to their original measurement and are marked
            “unverified” until they are remeasured or confirmed against the new source.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 overflow-y-auto">
          <label className="grid gap-1 text-sm">Reason *
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Drawing S-100 issued at Rev P03" />
          </label>
          <label className="grid gap-1 text-sm">Source drawing revision *
            <select className={fieldCls} value={revisionId} onChange={(e) => setRevisionId(e.target.value)}>
              <option value="">Select the exact revision…</option>
              {drawings.map((d) => (
                <optgroup key={d.id} label={`${d.drawing_no} — ${d.title}`}>
                  {(revisionsByDrawing[d.id] ?? []).map((r) => (
                    <option key={r.id} value={r.id}>Rev {r.revision} · {r.status}{r.id === currentRevisionId ? " (current source)" : ""}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Measurement ruleset *
            <select className={fieldCls} value={rulesetVersionId} onChange={(e) => setRulesetVersionId(e.target.value)}>
              {rulesetVersions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Carry forward ({carry.size} of {items.length})</span>
              <span className="flex gap-2 text-xs">
                <button className="text-primary hover:underline" onClick={() => setCarry(new Set(items.map((i) => i.id)))}>all</button>
                <button className="text-primary hover:underline" onClick={() => setCarry(new Set())}>none</button>
              </span>
            </div>
            <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <input type="checkbox" checked={carry.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Carry ${i.qto_no}`} />
                  <span className="font-mono">{i.qto_no}</span>
                  <span className="truncate">{i.description}</span>
                  <span className="ml-auto tabular-nums">{Number(i.quantity)} {i.unit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={busy || !reason.trim() || !revisionId || !rulesetVersionId} onClick={async () => {
            setBusy(true);
            try { await onCreate({ reason: reason.trim(), revisionId, rulesetVersionId, carry: [...carry] }); } finally { setBusy(false); }
          }}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Create version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Publish ─────────────────────────────────────────────────────────────────

export function PublishDialog({ versionNo, itemCount, onCancel, onConfirm }: {
  versionNo: number;
  itemCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish version {versionNo} as the quantity baseline?</DialogTitle>
          <DialogDescription>
            {itemCount} items, their calculations, source revision and ruleset are frozen in an immutable snapshot with an
            integrity hash. Any later change needs a new version. Publishing does not change the BOQ; transfer is a separate step.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Transfer to the tender BOQ ──────────────────────────────────────────────

export function TransferDialog({ publication, tenderLabel, tenderId, history, onClose, onDone }: {
  publication: QtoPublication;
  tenderLabel: string;
  tenderId: string;
  history: QtoTransfer[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [includeProvisional, setIncludeProvisional] = useState(false);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(false);
  // One key per attempt; Retry reuses it, so a lost response cannot apply the transfer twice.
  const [key, setKey] = useState(() => newIdempotencyKey(publication.id));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QtoTransfer | null>(null);
  const counts = useMemo(() => {
    const items = publication.snapshot.items;
    return {
      firm: items.filter((i) => i.quantity_status === "FIRM").length,
      provisional: items.filter((i) => i.quantity_status === "PROVISIONAL").length,
      other: items.filter((i) => i.quantity_status !== "FIRM" && i.quantity_status !== "PROVISIONAL").length,
    };
  }, [publication]);

  async function run() {
    setBusy(true);
    try {
      const r = await transferToTenderBoq({ publicationId: publication.id, tenderId, idempotencyKey: key, includeProvisional, allowOverwrite });
      setResult(r);
      if (r.status === "succeeded") { toast.success(r.replayed ? "Transfer already applied" : "Quantities transferred to the tender BOQ"); onDone(); }
      else toast.error("Transfer failed; nothing in the BOQ was changed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transfer to the tender BOQ</DialogTitle>
          <DialogDescription>
            Writes the published quantities into the BOQ lines mapped on each item (or new lines). A retry never duplicates
            quantities, and lines changed outside take-off are not overwritten unless you allow it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 overflow-y-auto text-sm">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Published baseline</p>
            <p className="font-mono text-xs">{publication.snapshot.session.code} v{publication.snapshot.version.no} · {publication.snapshot_hash.slice(0, 16)}…</p>
            <p className="mt-1 text-xs">{counts.firm} firm · {counts.provisional} provisional · {counts.other} excluded / pending (never transferred)</p>
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={confirmTarget} onChange={(e) => setConfirmTarget(e.target.checked)} />
            <span>Target: tender BOQ of <b>{tenderLabel}</b> (the session’s tender). I have checked this is the right estimate.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={includeProvisional} onChange={(e) => { setIncludeProvisional(e.target.checked); setKey(newIdempotencyKey(publication.id)); }} />
            <span>Include provisional items ({counts.provisional})</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={allowOverwrite} onChange={(e) => { setAllowOverwrite(e.target.checked); setKey(newIdempotencyKey(publication.id)); }} />
            <span>Allow overwriting BOQ lines that were changed outside take-off</span>
          </label>

          {result && (
            <div className={cn("rounded-md border p-3", result.status === "succeeded" ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-destructive/40 bg-destructive/10")}>
              <p className="flex items-center gap-1 font-medium">
                {result.status === "succeeded" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                {result.status === "succeeded" ? (result.replayed ? "Already applied (same key)" : "Transfer succeeded") : "Transfer failed"}
              </p>
              {result.error && <p className="mt-1 text-xs">{result.error.replace(/^QTO_[A-Z_]+:\s*/, "")}</p>}
              {result.lines.length > 0 && (
                <ul className="mt-2 text-xs">
                  {result.lines.map((l) => (
                    <li key={l.boq_item_id}><Badge variant="outline">{l.action}</Badge> line {l.boq_item_id.slice(0, 8)} · {l.previous_qty ?? "—"} → {l.new_qty}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold">Earlier transfers of this publication</p>
              <ul className="divide-y divide-border rounded-md border border-border text-xs">
                {history.map((t) => (
                  <li key={t.id} className="flex gap-2 px-2 py-1">
                    <Badge variant={t.status === "succeeded" ? "default" : "destructive"}>{t.status}</Badge>
                    <span>{new Date(t.created_at).toLocaleString()}</span>
                    <span className="truncate text-muted-foreground">{t.error?.replace(/^QTO_[A-Z_]+:\s*/, "") ?? `${t.lines.length} lines`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {result?.status === "failed" ? (
            <Button disabled={busy} onClick={() => { setKey(newIdempotencyKey(publication.id)); setResult(null); }}>Try again</Button>
          ) : (
            <Button disabled={busy || !confirmTarget || result?.status === "succeeded"} onClick={() => void run()}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Transfer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────

export async function exportPublication(publication: QtoPublication, format: "xlsx" | "csv", lookups: ExportLookups) {
  const rows = buildExportRows(publication.snapshot, publication.snapshot_hash, lookups);
  const name = `${publication.snapshot.session.code}_v${publication.snapshot.version.no}_${publication.snapshot_hash.slice(0, 8)}`;
  if (format === "csv") {
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toSheetRows(rows)), "Quantities");
    const meta = [
      ["Session", publication.snapshot.session.code, publication.snapshot.session.name],
      ["Version", publication.snapshot.version.no],
      ["Source", publication.snapshot.source.drawing_no, publication.snapshot.source.revision],
      ["Ruleset", publication.snapshot.ruleset.ruleset_code, publication.snapshot.ruleset.version_no],
      ["Published", publication.published_at],
      ["Snapshot hash (sha256)", publication.snapshot_hash],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "Baseline");
    XLSX.writeFile(wb, `${name}.xlsx`);
  }
  await logExport(publication.id, format, rows.length);
}
