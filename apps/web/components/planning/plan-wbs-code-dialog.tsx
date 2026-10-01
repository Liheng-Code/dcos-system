"use client";

import { useState } from "react";
import { Hash, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { upsertPlanWbsCodeMask } from "@/lib/planning/planning-queries";
import { cn } from "@/lib/utils";
import {
  computeWbsCode,
  SEP_NONE_LABEL,
  SEPARATORS,
  SEQ_LABELS,
  type WbsCodeMask,
  type WbsMaskLevel,
  type WbsSeq,
} from "@/lib/planning/wbs-code-mask";

interface Props {
  projectId: string;
  mask: WbsCodeMask;
  /** First few outline rows for the live preview: 1-based sibling path + name. */
  sampleRows: { path: number[]; name: string }[];
  onClose: () => void;
  /** Persist the just-saved mask onto every row. */
  onRenumber: (mask: WbsCodeMask) => Promise<void>;
}

export function PlanWbsCodeDialog({ projectId, mask, sampleRows, onClose, onRenumber }: Props) {
  const [prefix, setPrefix] = useState(mask.prefix);
  const [levels, setLevels] = useState<WbsMaskLevel[]>(
    mask.levels.length ? mask.levels : [{ sequence: "numbers", length: 2, separator: "." }],
  );
  const [generateForNew, setGenerateForNew] = useState(mask.generateForNew);
  const [verifyUnique, setVerifyUnique] = useState(mask.verifyUnique);
  const [saving, setSaving] = useState(false);

  const draft: WbsCodeMask = { prefix, levels, generateForNew, verifyUnique };
  const preview = sampleRows
    .slice(0, 6)
    .map((r) => ({ code: computeWbsCode(r.path, draft), name: r.name }));

  const setLevel = (i: number, patch: Partial<WbsMaskLevel>) =>
    setLevels((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  async function handleSave() {
    setSaving(true);
    const { error } = await upsertPlanWbsCodeMask({
          project_id: projectId,
          code_prefix: prefix,
          levels: levels.map((l) => ({
            sequence: l.sequence,
            length: l.length,
            separator: l.separator,
          })),
          generate_for_new: generateForNew,
          verify_unique: verifyUnique,
          updated_at: new Date().toISOString(),
        });
    if (error) {
      setSaving(false);
      toast.error("Failed to save WBS code definition: " + error.message);
      return;
    }
    await onRenumber(draft);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Hash className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">WBS Code Definition</h2>
            <p className="text-[11px] text-white/70">
              Project prefix + a code mask per outline level (MS-Project style)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          <label className="block text-xs">
            <span className="font-semibold">Project Code Prefix</span>
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g. HTBT"
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold">Code mask (per outline level)</span>
              <button
                type="button"
                onClick={() =>
                  setLevels((p) => [...p, { ...(p[p.length - 1] ?? { sequence: "numbers", length: 2, separator: "." }) }])
                }
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-muted/40"
              >
                <Plus className="h-3 w-3" /> Add level
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Level</th>
                    <th className="px-2 py-1.5 text-left font-medium">Sequence</th>
                    <th className="px-2 py-1.5 text-left font-medium">Length</th>
                    <th className="px-2 py-1.5 text-left font-medium">Separator</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {levels.map((lvl, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <select
                          value={lvl.sequence}
                          onChange={(e) => setLevel(i, { sequence: e.target.value as WbsSeq })}
                          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs outline-none"
                        >
                          {(Object.keys(SEQ_LABELS) as WbsSeq[]).map((s) => (
                            <option key={s} value={s}>
                              {SEQ_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={lvl.length ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setLevel(i, { length: v === "" ? null : Math.max(1, Number(v) || 1) });
                          }}
                          placeholder="Any"
                          className="w-16 rounded border border-border bg-background px-1.5 py-1 text-xs outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={lvl.separator}
                          onChange={(e) => setLevel(i, { separator: e.target.value })}
                          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs outline-none"
                        >
                          {SEPARATORS.map((s) => (
                            <option key={s} value={s}>
                              {s === "" ? SEP_NONE_LABEL : s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1">
                        {levels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setLevels((p) => p.filter((_, k) => k !== i))}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Outline levels deeper than the mask reuse the last row.
            </p>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={generateForNew}
                onChange={(e) => setGenerateForNew(e.target.checked)}
              />
              Generate WBS code for new tasks
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={verifyUnique}
                onChange={(e) => setVerifyUnique(e.target.checked)}
              />
              Verify uniqueness of new WBS codes
            </label>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
              Code preview
            </div>
            {preview.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rows yet.</p>
            ) : (
              <div className="space-y-0.5 font-mono text-xs">
                {preview.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="w-28 shrink-0 font-semibold text-primary">{p.code}</span>
                    <span className="truncate text-muted-foreground">{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
            )}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save &amp; renumber
          </button>
        </div>
      </div>
    </div>
  );
}
