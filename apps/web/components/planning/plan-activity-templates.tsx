"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import * as lib from "@/lib/planning/activity-library/library-service";
import type { ActMethod, ActTemplate, Relation } from "@/lib/planning/activity-library/types";
import { ApplicabilityEditor } from "./plan-act-master-editors";
import { ActStatusPill, CodeChip, EmptyNote, STATUS_LABEL, nextStatuses } from "./plan-act-shared";

type Pickable = Awaited<ReturnType<typeof lib.listPickableMasters>>[number];
const selectCls = "h-8 rounded-md border border-input bg-background px-1.5 text-xs";

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

export function PlanActivityTemplates() {
  const supabase = useMemo(() => createClient(), []);
  const [templates, setTemplates] = useState<ActTemplate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<lib.TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // editor state (only used while the template is a draft)
  const [items, setItems] = useState<lib.TemplateItemDraft[]>([]);
  const [deps, setDeps] = useState<lib.TemplateDepDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [masters, setMasters] = useState<Pickable[]>([]);
  const [methods, setMethods] = useState<ActMethod[]>([]);
  const [pick, setPick] = useState("");

  async function open(id: string) {
    setSelected(id);
    const d = await lib.loadTemplateDetail(supabase, id);
    setDetail(d);
    setItems(d.items.map((it) => ({ key: it.id, master_id: it.master_id, scope: it.scope, method_id: it.method_id, duration_days_override: it.duration_days_override, crews: it.crews ?? 1, note: it.note })));
    setDeps(d.dependencies.map((x) => ({ from_key: x.predecessor_item_id, to_key: x.successor_item_id, relation: x.relation, lag_days: x.lag_days, is_optional: x.is_optional })));
    setDirty(false);
    if (d.template.status === "draft") {
      const [m] = await Promise.all([lib.listPickableMasters(supabase)]);
      setMasters(m);
      setMethods(await lib.listMethodsForMasters(supabase, [...new Set([...d.items.map((i) => i.master_id), ...m.map((x) => x.id)])]));
    }
  }

  async function reload(keep?: string) {
    try {
      const list = await lib.listTemplates(supabase);
      setTemplates(list);
      const id = keep ?? selected ?? list[0]?.id ?? null;
      if (id) await open(id); else setDetail(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load templates");
    } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets state after awaiting
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(label: string, fn: () => Promise<string | void>) {
    try { const next = await fn(); toast.success(label); await reload(next ?? undefined); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const editable = detail?.template.status === "draft";
  const masterOf = (id: string) => masters.find((m) => m.id === id) ?? detail?.items.find((i) => i.master_id === id)?.master ?? null;
  const touch = () => setDirty(true);
  const indexOf = (key: string) => items.findIndex((x) => x.key === key);
  const isBackward = (d: lib.TemplateDepDraft) => indexOf(d.from_key) >= indexOf(d.to_key);
  const backwardCount = deps.filter(isBackward).length;

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next); touch();
  }
  function removeItem(key: string) {
    setItems(items.filter((i) => i.key !== key));
    setDeps(deps.filter((d) => d.from_key !== key && d.to_key !== key)); touch();
  }
  function addItem() {
    if (!pick) return;
    const dm = methods.find((m) => m.master_id === pick && m.is_default);
    setItems([...items, { key: newKey(), master_id: pick, scope: "floor", method_id: dm?.id ?? null, duration_days_override: null, crews: 1, note: null }]);
    setPick(""); touch();
  }
  function autoChain() {
    setDeps(items.slice(1).map((it, i) => ({ from_key: items[i].key, to_key: it.key, relation: "fs" as Relation, lag_days: 0, is_optional: false })));
    touch();
  }
  function patchDep(idx: number, p: Partial<lib.TemplateDepDraft>) {
    setDeps(deps.map((d, i) => (i === idx ? { ...d, ...p } : d))); touch();
  }

  async function save() {
    if (!detail) return;
    if (backwardCount > 0) { toast.error("Some links point to a later activity. Fix or remove them (or use Chain all FS) before saving."); return; }
    setSaving(true);
    try {
      await lib.saveTemplateRecipe(supabase, detail.template.id, items, deps);
      toast.success("Recipe saved");
      await open(detail.template.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); } finally { setSaving(false); }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_1fr]">
      <aside className="overflow-y-auto border-r border-border bg-card p-3">
        <Button size="sm" className="mb-3 w-full" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> New template</Button>
        {templates.length === 0 && <EmptyNote>No templates yet.</EmptyNote>}
        {templates.map((t) => (
          <button key={t.id} onClick={() => void open(t.id)}
            className={cn("mb-2 w-full rounded-lg border border-border p-3 text-left hover:border-primary", selected === t.id && "border-primary bg-primary/5")}>
            <CodeChip code={t.code} />
            <div className="mt-1 text-sm font-semibold">{t.name}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><ActStatusPill status={t.status} /> v{t.version}</div>
          </button>
        ))}
      </aside>

      <section className="min-h-0 overflow-auto p-6">
        {!detail ? <EmptyNote>Select or create a template.</EmptyNote> : (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <CodeChip code={detail.template.code} />
                <h2 className="mt-1 text-lg font-bold">{detail.template.name} <span className="text-sm font-normal text-muted-foreground">v{detail.template.version}</span></h2>
                <p className="text-sm text-muted-foreground">{detail.template.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.applicability.map((a, i) => (
                    <span key={i} className="rounded-full border border-border bg-muted px-3 py-0.5 text-xs">{a.attribute} {a.operator} {a.values.join(" | ")}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {nextStatuses(detail.template.status).map((s) => (
                  <Button key={s} size="sm" variant="outline" disabled={dirty && s !== "draft"} onClick={() => act(`Status: ${STATUS_LABEL[s]}`, async () => {
                    if (s === "active") await lib.activateTemplate(supabase, detail.template.id); else await lib.setTemplateStatus(supabase, detail.template.id, s);
                    return detail.template.id;
                  })}>{STATUS_LABEL[s]}</Button>
                ))}
                {(detail.template.status === "active" || detail.template.status === "approved") && (
                  <Button size="sm" onClick={() => act("New draft version created", async () => (await lib.createTemplateVersion(supabase, detail.template.id)).id)}>New version</Button>
                )}
                {editable && <Button size="sm" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save recipe"}</Button>}
              </div>
            </div>

            <div className="mx-auto mb-6 max-w-3xl space-y-4">
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Applicability</div>
                <ApplicabilityEditor targetType="template" targetId={detail.template.id} editable={editable} />
              </div>
              <InterLevelEditor
                template={detail.template}
                items={items.map((it, i) => ({ seq: i + 1, name: masterOf(it.master_id)?.name ?? "?" }))}
                editable={editable}
                dirty={dirty}
                onSaved={() => void reload(detail.template.id)}
              />
            </div>

            <ol className="mx-auto max-w-3xl">
              {items.map((it, i) => {
                const m = masterOf(it.master_id);
                const incoming = deps.map((d, idx) => ({ d, idx })).filter((x) => x.d.to_key === it.key);
                const itemMethods = methods.filter((x) => x.master_id === it.master_id);
                return (
                  <li key={it.key}>
                    <div className="rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{String(i + 1).padStart(2, "0")}</span>
                        <div className="min-w-0 flex-1">
                          <CodeChip code={m?.code ?? "—"} />
                          <div className="truncate text-sm font-medium">{m?.name ?? "Unknown activity"}</div>
                        </div>
                        {editable ? (
                          <div className="flex items-center gap-1">
                            {itemMethods.length > 0 && (
                              <select className={selectCls} value={it.method_id ?? ""} onChange={(e) => { setItems(items.map((x) => x.key === it.key ? { ...x, method_id: e.target.value || null } : x)); touch(); }}>
                                <option value="">No method</option>
                                {itemMethods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                              </select>
                            )}
                            <Input className="h-8 w-20 text-xs" type="number" step="0.5" min="0" placeholder="calc." title="Standard duration in working days; empty = calculated from quantity / productivity"
                              value={it.duration_days_override ?? ""}
                              onChange={(e) => { setItems(items.map((x) => x.key === it.key ? { ...x, duration_days_override: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) } : x)); touch(); }} />
                            <Input className="h-8 w-16 text-xs" type="number" step="1" min="1" max="50"
                              title="Crews (parallel gangs) the calculated duration is planned with. Duration = quantity / (output per crew-day x crews). Ignored when a fixed duration is set."
                              disabled={it.duration_days_override != null}
                              value={it.crews ?? 1}
                              onChange={(e) => { const c = Number(e.target.value); setItems(items.map((x) => x.key === it.key ? { ...x, crews: Number.isFinite(c) && c > 0 ? Math.min(50, c) : 1 } : x)); touch(); }} />
                            <span className="text-[10px] text-muted-foreground">crews</span>
                            <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => removeItem(it.key)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          <div className="text-right text-xs text-muted-foreground">
                            <div>
                              {m?.default_unit}
                              {it.duration_days_override != null
                                ? ` · ${it.duration_days_override} d`
                                : ` · calculated${(it.crews ?? 1) > 1 ? ` · ${it.crews} crews` : ""}`}
                            </div>
                            {detail.items.find((x) => x.id === it.key)?.method_name && <div>{detail.items.find((x) => x.id === it.key)?.method_name}</div>}
                          </div>
                        )}
                      </div>
                      {incoming.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-border pt-2">
                          {incoming.map(({ d, idx }) => {
                            const from = items.findIndex((x) => x.key === d.from_key);
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Link2 className={cn("h-3 w-3", isBackward(d) && "text-red-500")} /> <span className={cn(isBackward(d) && "font-semibold text-red-500")}>after #{from + 1}{isBackward(d) ? " — out of order" : ""}</span>
                                {editable ? (
                                  <>
                                    <select className={selectCls} value={d.relation} onChange={(e) => patchDep(idx, { relation: e.target.value as Relation })}>
                                      {(["fs", "ss", "ff", "sf"] as const).map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                                    </select>
                                    lag <Input className="h-8 w-16 text-xs" type="number" value={d.lag_days} onChange={(e) => patchDep(idx, { lag_days: Number(e.target.value) || 0 })} /> d
                                    <label className="flex items-center gap-1"><input type="checkbox" checked={d.is_optional} onChange={(e) => patchDep(idx, { is_optional: e.target.checked })} /> optional</label>
                                    <Button size="icon" variant="ghost" onClick={() => { setDeps(deps.filter((_, k) => k !== idx)); touch(); }} aria-label="Remove link"><Trash2 className="h-3 w-3" /></Button>
                                  </>
                                ) : (
                                  <b className="uppercase">{d.relation}{d.lag_days ? ` ${d.lag_days > 0 ? "+" : ""}${d.lag_days}d` : ""}{d.is_optional ? " (optional)" : ""}</b>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {editable && i > 0 && (
                        <div className="mt-2">
                          <select className={selectCls} value="" onChange={(e) => {
                            if (!e.target.value) return;
                            if (deps.some((d) => d.from_key === e.target.value && d.to_key === it.key)) return;
                            setDeps([...deps, { from_key: e.target.value, to_key: it.key, relation: "fs", lag_days: 0, is_optional: false }]); touch();
                          }}>
                            <option value="">+ add predecessor…</option>
                            {items.slice(0, i).map((p, k) => <option key={p.key} value={p.key}>#{k + 1} {masterOf(p.master_id)?.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    {i < items.length - 1 && <div className="ml-6 h-4 border-l-2 border-border" />}
                  </li>
                );
              })}
            </ol>

            {editable && (
              <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
                <select className={cn(selectCls, "h-9 min-w-64 flex-1")} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Add activity…</option>
                  {masters.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                </select>
                <Button size="sm" onClick={addItem} disabled={!pick}><Plus className="mr-1 h-4 w-4" /> Add</Button>
                <Button size="sm" variant="outline" onClick={autoChain} disabled={items.length < 2}>Chain all FS</Button>
              </div>
            )}
            {!editable && (
              <p className="mt-6 text-center text-xs text-muted-foreground">Items are frozen once a template leaves draft. Create a new version to change the recipe.</p>
            )}
          </>
        )}
      </section>

      {creating && <NewTemplateDialog onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); void reload(t.id); }} />}
    </div>
  );
}

function NewTemplateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: ActTemplate) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [levels, setLevels] = useState("typical");

  async function create() {
    if (!code.trim() || !name.trim()) { toast.error("Code and name are required"); return; }
    try {
      const t = await lib.createTemplate(supabase, {
        code: code.trim().toUpperCase(), name: name.trim(), description: description.trim() || null, owner: null,
        applies_to_level_types: levels.split(",").map((s) => s.trim()).filter(Boolean),
      });
      toast.success(`${t.code} created as draft`);
      onCreated(t);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Activity Template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="TPL-STR-HR-RC-FLOOR-002" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input placeholder="Applies to level types (comma separated)" value={levels} onChange={(e) => setLevels(e.target.value)} />
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={create}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InterLevelEditor({
  template, items, editable, dirty, onSaved,
}: {
  template: ActTemplate;
  items: { seq: number; name: string }[];
  editable: boolean;
  dirty: boolean;
  onSaved: () => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [from, setFrom] = useState(String(template.inter_level_from_seq ?? ""));
  const [to, setTo] = useState(String(template.inter_level_to_seq ?? ""));
  const [rel, setRel] = useState<Relation>(template.inter_level_relation);
  const [lag, setLag] = useState(String(template.inter_level_lag_days ?? 0));
  const name = (seq: number | null) => items.find((i) => i.seq === seq)?.name ?? "?";
  const sel = "h-8 rounded-md border border-input bg-background px-1.5 text-xs";

  async function save(clear: boolean) {
    try {
      await lib.updateTemplateHeader(db, template.id, clear
        ? { inter_level_from_seq: null, inter_level_to_seq: null, inter_level_relation: "fs", inter_level_lag_days: 0 }
        : { inter_level_from_seq: Number(from), inter_level_to_seq: Number(to), inter_level_relation: rel, inter_level_lag_days: Number(lag) || 0 });
      toast.success(clear ? "Level link removed" : "Level link saved");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">Link between levels</div>
      {template.inter_level_from_seq != null && template.inter_level_to_seq != null ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span>Level N+1 <b>#{template.inter_level_to_seq} {name(template.inter_level_to_seq)}</b> follows level N <b>#{template.inter_level_from_seq} {name(template.inter_level_from_seq)}</b></span>
          <span className="rounded bg-muted px-1.5 text-[11px] font-semibold uppercase">{template.inter_level_relation}{Number(template.inter_level_lag_days) ? ` ${template.inter_level_lag_days > 0 ? "+" : ""}${template.inter_level_lag_days}d` : ""}</span>
          {editable && <Button size="sm" variant="ghost" onClick={() => void save(true)}>Remove</Button>}
        </div>
      ) : !editable ? (
        <p className="text-sm text-muted-foreground">Levels are independent (no link between consecutive levels).</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs">
          Level N+1
          <select className={sel} value={to} onChange={(e) => setTo(e.target.value)}><option value="">activity…</option>{items.map((i) => <option key={i.seq} value={i.seq}>#{i.seq} {i.name}</option>)}</select>
          follows level N
          <select className={sel} value={from} onChange={(e) => setFrom(e.target.value)}><option value="">activity…</option>{items.map((i) => <option key={i.seq} value={i.seq}>#{i.seq} {i.name}</option>)}</select>
          <select className={sel} value={rel} onChange={(e) => setRel(e.target.value as Relation)}>{(["fs", "ss", "ff", "sf"] as const).map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}</select>
          lag <Input className="h-8 w-16 text-xs" type="number" value={lag} onChange={(e) => setLag(e.target.value)} /> d
          <Button size="sm" disabled={!from || !to || dirty} title={dirty ? "Save the recipe first: positions must match the saved order" : undefined} onClick={() => void save(false)}>Save link</Button>
        </div>
      )}
    </div>
  );
}
