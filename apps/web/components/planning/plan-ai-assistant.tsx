"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { listAiRuns, listSuggestions, loadAiStatus, saveAiSettings, type AiRunRow, type AiStatus, type AiSuggestionRow } from "@/lib/planning/activity-library/ai/ai-client";
import { PlanAiSuggestionList } from "./plan-ai-suggestions";
import { EmptyNote } from "./plan-act-shared";

const TOOL_LABEL: Record<string, string> = {
  find_activity_master: "Find activity", suggest_quantity_mapping: "BOQ mapping", suggest_productivity: "Productivity",
  detect_schedule_conflict: "Conflicts", explain_generation: "Explain run", suggest_recovery_plan: "Recovery",
};

/** Organisation switch, monthly budget, usage and the history of what the assistant suggested and what was decided. */
export function PlanAiAssistant() {
  const db = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [form, setForm] = useState<{ cap: string; tokens: string; model: string; pin: string; pout: string } | null>(null);
  const [runs, setRuns] = useState<AiRunRow[]>([]);
  const [suggestions, setSuggestions] = useState<AiSuggestionRow[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r, g] = await Promise.all([loadAiStatus(db), listAiRuns(db), listSuggestions(db, { limit: 20 })]);
      setStatus(s); setRuns(r); setSuggestions(g);
      setForm({ cap: String(s.monthly_cap_usd), tokens: String(s.run_token_limit), model: s.model ?? "", pin: String(s.price_in_per_mtok), pout: String(s.price_out_per_mtok) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
  }, [db]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  if (!status || !form) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const pct = status.monthly_cap_usd > 0 ? Math.min(100, (status.spend / status.monthly_cap_usd) * 100) : 100;

  async function save(patch: Parameters<typeof saveAiSettings>[1], ok: string) {
    setSaving(true);
    try { await saveAiSettings(db, patch); toast.success(ok); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> AI assistance</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Advisory only. The assistant chooses among options the engine produced and explains figures the engine calculated; every suggestion shows its reason, source, confidence and what it would touch,
              and nothing changes until a planner accepts it. Only activity codes, names and numbers are sent to the model: no people, rates or photos.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={status.enabled} disabled={saving} onChange={(e) => void save({ enabled: e.target.checked }, e.target.checked ? "AI assistance is on" : "AI assistance is off")} />
            {status.enabled ? "On" : "Off"}
          </label>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span>Spent this month</span>
            <span className="font-mono"><b>USD {Math.round(status.spend * 1000) / 1000}</b> of {status.monthly_cap_usd}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-muted"><div className={pct >= 90 ? "h-full bg-red-500" : "h-full bg-primary"} style={{ width: `${pct}%` }} /></div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {([["Monthly cap (USD)", "cap"], ["Max tokens per call", "tokens"], ["Model (blank = default)", "model"], ["USD / 1M input tokens", "pin"], ["USD / 1M output tokens", "pout"]] as const).map(([label, k]) => (
            <label key={k} className="text-xs"><span className="mb-1 block text-muted-foreground">{label}</span>
              <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
          ))}
        </div>
        <Button size="sm" className="mt-3" disabled={saving} onClick={() => void save({
          monthly_cap_usd: Number(form.cap), run_token_limit: Number(form.tokens), model: form.model.trim() || null,
          price_in_per_mtok: Number(form.pin), price_out_per_mtok: Number(form.pout),
        }, "Settings saved")}>Save settings</Button>
        <p className="mt-2 text-xs text-muted-foreground">Prices are used only to count the budget. A request that would exceed the cap, or one larger than the token limit, is refused before anything is sent.</p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Recent suggestions</h3>
        {suggestions.length === 0 ? <EmptyNote>No suggestions yet. Use the AI buttons on a generation run, in the BOQ link dialog or in the activity library.</EmptyNote>
          : <PlanAiSuggestionList suggestions={suggestions} projectId={null} onChanged={() => void load()} compact />}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Calls</h3>
        {runs.length === 0 ? <EmptyNote>No calls yet.</EmptyNote> : (
          <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
            <thead><tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
              <th className="px-3 py-2">When</th><th className="px-3 py-2">Tool</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Tokens in / out</th><th className="px-3 py-2">Cost (USD)</th><th className="px-3 py-2">Note</th>
            </tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-3 py-1.5">{TOOL_LABEL[r.tool] ?? r.tool}</td>
                  <td className="px-3 py-1.5 uppercase text-xs font-semibold">{r.status}</td>
                  <td className="px-3 py-1.5">{r.input_tokens ?? "—"} / {r.output_tokens ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.cost_usd ?? "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
