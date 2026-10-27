"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createRuleDraft, createRuleset, listRulesets, setRuleVersionStatus, type RulesetWithVersions,
} from "@/lib/qs/qto/session-service";
import type { QtoRuleVersion, RulesetDefinition } from "@/lib/qs/qto/types";
import { evaluate } from "@/lib/qs/qto/expression";

/** Checks a definition before it is saved: shape, rounding, factor ranges and that every formula parses. */
function checkDefinition(d: unknown): string | null {
  const def = d as RulesetDefinition;
  if (!def || typeof def !== "object") return "The definition must be a JSON object";
  if (!def.rounding || !["net", "final", "none"].includes(def.rounding.stage) || !(def.rounding.dp >= 0 && def.rounding.dp <= 4)) {
    return "rounding needs stage (net | final | none) and dp from 0 to 4";
  }
  if (!Array.isArray(def.factors) || def.factors.some((f) => !f.name || !(f.min > 0) || !(f.max >= f.min))) {
    return "each factor needs a name and 0 < min ≤ max";
  }
  if (!Array.isArray(def.rules)) return "rules must be a list";
  for (const r of def.rules) {
    if (!r.code || !r.name) return "each rule needs a code and a name";
    if (r.formula) {
      const vars = Object.fromEntries((r.inputs ?? []).map((i) => [i.name, { value: 1, unit: i.unit }]));
      const res = evaluate(r.formula, vars);
      if (!res.ok) return `rule ${r.code}: ${res.error}`;
    }
  }
  return null;
}

export function QtoRulesTab({ canConfigure }: { canConfigure: boolean }) {
  const [sets, setSets] = useState<RulesetWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<QtoRuleVersion | null>(null);
  const [draftFor, setDraftFor] = useState<RulesetWithVersions | null>(null);
  const [draftText, setDraftText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSet, setNewSet] = useState<{ code: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSets(await listRulesets()); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not load rulesets"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const startDraft = (s: RulesetWithVersions) => {
    const latest = s.versions.at(-1);
    setDraftFor(s);
    setNote("");
    setDraftText(JSON.stringify(latest?.definition ?? { rounding: { stage: "final", dp: 3, mode: "half_up" }, factors: [], rules: [] }, null, 2));
  };

  if (loading) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Sessions use an <b>approved</b> ruleset version. An approved version never changes; edits create a new draft version,
          and earlier take-offs keep the version they were measured with.
        </p>
        {sets.map((s) => (
          <div key={s.id} className="rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className="font-mono text-xs">{s.code}</span>
              <span className="font-medium">{s.name}</span>
              {!s.tenant_id && <Badge variant="outline">DCOS default</Badge>}
              {canConfigure && s.tenant_id && (
                <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => startDraft(s)}><Plus className="mr-1 h-3.5 w-3.5" /> New draft version</Button>
              )}
            </div>
            <ul className="divide-y divide-border text-sm">
              {s.versions.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-3 py-1.5">
                  <button className="hover:underline" onClick={() => setOpen(v)}>v{v.version_no}</button>
                  <Badge variant={v.status === "approved" ? "default" : "outline"}>{v.status}</Badge>
                  <span className="truncate text-xs text-muted-foreground">{v.change_note}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{v.approved_at ? `approved ${new Date(v.approved_at).toLocaleDateString()}` : ""}</span>
                  {canConfigure && s.tenant_id && v.status === "draft" && (
                    <Button size="sm" className="h-6 px-2 text-xs" disabled={busy}
                      onClick={() => void run(() => setRuleVersionStatus(v.id, "approved"), `v${v.version_no} approved`)}>Approve</Button>
                  )}
                  {canConfigure && s.tenant_id && v.status === "approved" && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy}
                      onClick={() => void run(() => setRuleVersionStatus(v.id, "retired"), `v${v.version_no} retired`)}>Retire</Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {canConfigure && (newSet ? (
          <div className="flex gap-2">
            <Input placeholder="Code, e.g. ACME-SMM" value={newSet.code} onChange={(e) => setNewSet({ ...newSet, code: e.target.value })} />
            <Input placeholder="Name" value={newSet.name} onChange={(e) => setNewSet({ ...newSet, name: e.target.value })} />
            <Button disabled={busy || !newSet.code.trim() || !newSet.name.trim()} onClick={() => void run(async () => {
              await createRuleset(newSet);
              setNewSet(null);
            }, "Ruleset created")}>Create</Button>
          </div>
        ) : (
          <Button variant="outline" className="self-start" onClick={() => setNewSet({ code: "", name: "" })}><Plus className="mr-1 h-4 w-4" /> Company ruleset</Button>
        ))}
      </div>

      <div className="rounded-lg border border-border p-3">
        {draftFor ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">New draft for {draftFor.code} (v{(draftFor.versions.at(-1)?.version_no ?? 0) + 1})</p>
            <Input placeholder="What changed and why" value={note} onChange={(e) => setNote(e.target.value)} />
            <textarea className="min-h-[420px] w-full rounded-md border border-input bg-transparent p-2 font-mono text-xs" value={draftText} onChange={(e) => setDraftText(e.target.value)} spellCheck={false} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraftFor(null)}>Cancel</Button>
              <Button disabled={busy || !note.trim()} onClick={() => {
                let parsed: unknown;
                try { parsed = JSON.parse(draftText); } catch { toast.error("The definition is not valid JSON"); return; }
                const problem = checkDefinition(parsed);
                if (problem) { toast.error(problem); return; }
                void run(async () => { await createRuleDraft(draftFor.id, parsed as RulesetDefinition, note.trim()); setDraftFor(null); }, "Draft saved");
              }}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save draft</Button>
            </div>
          </div>
        ) : open ? (
          <RuleVersionView v={open} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a version to see its rules, factors and rounding.</p>
        )}
      </div>
    </div>
  );
}

function RuleVersionView({ v }: { v: QtoRuleVersion }) {
  const d = v.definition;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-medium">Version {v.version_no} · {v.status}</p>
      <p className="text-xs">Rounding: {d.rounding?.stage} stage, {d.rounding?.dp} dp, {d.rounding?.mode?.replace("_", " ")}
        {d.validations?.max_variance_pct !== undefined && ` · variance warning above ${d.validations.max_variance_pct}%`}</p>
      <div>
        <p className="mb-1 text-xs font-semibold">Authorised factors</p>
        <ul className="text-xs">{(d.factors ?? []).map((f) => <li key={f.name}>{f.name}: {f.min} – {f.max}</li>)}</ul>
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground"><tr><th>Rule</th><th>Unit</th><th>Formula</th><th>Deductions</th><th>Factors</th></tr></thead>
        <tbody>
          {(d.rules ?? []).map((r) => (
            <tr key={r.code} className="border-t border-border align-top">
              <td className="py-1"><span className="font-mono">{r.code}</span><br />{r.name}</td>
              <td>{r.unit ?? "any"}</td>
              <td className="font-mono">{r.formula ?? "—"}</td>
              <td>{r.deduction_policy ?? "—"}</td>
              <td>{(r.allowed_factors ?? []).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
