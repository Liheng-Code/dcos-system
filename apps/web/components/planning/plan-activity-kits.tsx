"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { listTemplates } from "@/lib/planning/activity-library/library-service";
import { canManageLibraries } from "@/lib/planning/activity-library/qs-bridge-service";
import {
  activateKit, createKit, createKitVersion, listKitItems, listKits, saveKitItems, setKitStatus, updateKitHeader,
} from "@/lib/planning/activity-library/kit-service";
import { KIT_PARTS, pickTemplateVersion, type Kit, type KitItem, type KitPart } from "@/lib/planning/activity-library/kit-plan";
import { partLabel } from "@/lib/planning/activity-library/part-labels";
import type { ActTemplate } from "@/lib/planning/activity-library/types";
import { buildingTypeLabel } from "@/lib/project-categories";
import { sectorListLabel } from "@/lib/template-fit";
import { SectorListFields } from "@/components/administration/template-sector-fields";
import { ActStatusPill, CodeChip, EmptyNote, STATUS_LABEL, nextStatuses } from "./plan-act-shared";

const selectCls = "h-8 rounded-md border border-input bg-background px-1.5 text-xs";
const PART_HINT: Record<KitPart, string> = {
  basement: "Basement levels (bridge: foundations; culvert: base; utilities: pump station)",
  ground: "Ground floor (bridge: substructure; culvert: walls)",
  podium: "Podium levels",
  mezzanine: "Mezzanine levels",
  typical: "Floors above ground (bridge: spans; culvert: top slab)",
  roof: "Roof (bridge: deck; culvert: headwalls)",
  segment: "Chainage sections of a road, pipeline or cable route",
  site: "Site and external works: the project's External Works node",
};

/** Activity Library › Kits: which activity template goes on each part of a building pattern. */
export function PlanActivityKits() {
  const db = useMemo(() => createClient(), []);
  const [kits, setKits] = useState<Kit[]>([]);
  const [templates, setTemplates] = useState<ActTemplate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<KitItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const openSeq = useRef(0);

  const kit = kits.find((k) => k.id === selected) ?? null;
  const editable = canEdit && kit?.status === "draft";

  async function open(id: string) {
    const seq = ++openSeq.current;
    setSelected(id);
    try {
      const rows = await listKitItems(db, id);
      if (seq !== openSeq.current) return;
      setItems(rows);
      setDirty(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load the kit"); }
  }

  async function reload(keep?: string) {
    let list: Kit[];
    try {
      const [k, t] = await Promise.all([listKits(db), listTemplates(db)]);
      list = k;
      setKits(k);
      setTemplates(t);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load kits");
      return;
    } finally { setLoading(false); }
    const id = keep ?? selected ?? list[0]?.id ?? null;
    if (id) await open(id);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets state after awaiting
  useEffect(() => { void reload(); canManageLibraries(db).then(setCanEdit).catch(() => setCanEdit(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(label: string, fn: () => Promise<string | void>) {
    try { const next = await fn(); toast.success(label); await reload(next ?? undefined); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function save() {
    if (!kit) return;
    setSaving(true);
    try {
      await saveKitItems(db, kit.id, items);
      toast.success("Kit saved");
      await open(kit.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); } finally { setSaving(false); }
  }

  // one entry per template code: the version Generate would use
  const templateCodes = useMemo(() => {
    const codes = [...new Set(templates.map((t) => t.code))];
    return codes.map((c) => pickTemplateVersion(templates, c)).filter((t): t is ActTemplate => !!t).sort((a, b) => a.code.localeCompare(b.code));
  }, [templates]);

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const kind = kit ? { sector: kit.sectors[0] ?? null, buildingType: kit.building_types[0] ?? null } : {};
  const byPart = (p: KitPart) => items.map((it, i) => ({ it, i })).filter((x) => x.it.part === p);
  const missingParts = (["basement", "ground", "typical", "roof"] as KitPart[]).filter((p) => byPart(p).length === 0);
  const isLinear = kit?.building_types.some((b) => ["road", "drainage", "water_supply", "utility", "other_infrastructure"].includes(b));

  function patchItem(i: number, p: Partial<KitItem>) { setItems(items.map((x, k) => (k === i ? { ...x, ...p } : x))); setDirty(true); }
  function removeItem(i: number) { setItems(items.filter((_, k) => k !== i)); setDirty(true); }
  function addItem(part: KitPart, code: string) {
    if (!code) return;
    setItems([...items, { part, template_code: code, building_types: [], sort_order: 0 }].sort((a, b) => KIT_PARTS.indexOf(a.part) - KIT_PARTS.indexOf(b.part)));
    setDirty(true);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_1fr]">
      <aside className="overflow-y-auto border-r border-border bg-card p-3">
        {canEdit && <Button size="sm" className="mb-3 w-full" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> New kit</Button>}
        {kits.length === 0 && <EmptyNote>No kits yet.</EmptyNote>}
        {kits.map((k) => (
          <button key={k.id} onClick={() => { if (dirty && !confirm("Discard unsaved changes to this kit?")) return; void open(k.id); }}
            className={cn("mb-2 w-full rounded-lg border border-border p-3 text-left hover:border-primary", selected === k.id && "border-primary bg-primary/5")}>
            <CodeChip code={k.code} />
            <div className="mt-1 text-sm font-semibold">{k.name}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><ActStatusPill status={k.status} /> v{k.version}</div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{sectorListLabel(k.sectors)}</div>
          </button>
        ))}
      </aside>

      <section className="min-h-0 overflow-auto p-6">
        {!kit ? <EmptyNote>Select or create a kit.</EmptyNote> : (
          <div className="mx-auto max-w-4xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CodeChip code={kit.code} />
                <h2 className="mt-1 text-lg font-bold">{kit.name} <span className="text-sm font-normal text-muted-foreground">v{kit.version}</span></h2>
                {kit.description && <p className="text-sm text-muted-foreground">{kit.description}</p>}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  {nextStatuses(kit.status).map((s) => (
                    <Button key={s} size="sm" variant="outline" disabled={dirty} onClick={() => act(`Status: ${STATUS_LABEL[s]}`, async () => {
                      if (s === "active") await activateKit(db, kit.id); else await setKitStatus(db, kit.id, s);
                      return kit.id;
                    })}>{STATUS_LABEL[s]}</Button>
                  ))}
                  {(kit.status === "active" || kit.status === "approved") && (
                    <Button size="sm" onClick={() => act("New draft version created", async () => (await createKitVersion(db, kit.id)).id)}>New version</Button>
                  )}
                  {editable && <Button size="sm" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save kit"}</Button>}
                </div>
              )}
            </div>

            <KitSectors key={kit.id} kit={kit} canEdit={canEdit} onSaved={() => void reload(kit.id)} />

            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-xs font-semibold text-muted-foreground">Templates per part</div>
                <Link href="/dashboard/planning/activity-library/templates" className="text-xs text-primary hover:underline">Open Templates</Link>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Generate gives every level the templates of its part. The kit names templates by code and uses each one&apos;s active version,
                else approved; a draft can be previewed but not generated.
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                    <tr><th className="px-3 py-2">Part</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Only for</th><th className="w-10" /></tr>
                  </thead>
                  <tbody>
                    {KIT_PARTS.filter((p) => byPart(p).length > 0 || editable).map((p) => {
                      const rows = byPart(p);
                      return [
                        ...rows.map(({ it, i }, k) => {
                          const t = pickTemplateVersion(templates, it.template_code);
                          return (
                            <tr key={`${p}-${i}`} className="border-t border-border align-top">
                              <td className="px-3 py-2 text-xs">{k === 0 && <><div className="font-medium">{partLabel(p, kind)}</div><div className="text-muted-foreground">{PART_HINT[p]}</div></>}</td>
                              <td className="px-3 py-2">
                                {editable ? (
                                  <TemplatePicker part={p} value={it.template_code} templates={templateCodes} onChange={(code) => patchItem(i, { template_code: code })} />
                                ) : <><CodeChip code={it.template_code} /> <span className="text-xs text-muted-foreground">{t?.name ?? "missing template"}</span></>}
                                {t && <div className="mt-0.5 text-[11px] text-muted-foreground">uses v{t.version} · {STATUS_LABEL[t.status]}{t.status === "draft" ? " (preview only)" : ""}</div>}
                                {!t && <div className="mt-0.5 text-[11px] text-destructive">No template with this code</div>}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {editable ? kit.building_types.map((b) => {
                                    const on = it.building_types.includes(b);
                                    return (
                                      <button key={b} type="button"
                                        onClick={() => patchItem(i, { building_types: on ? it.building_types.filter((x) => x !== b) : [...it.building_types, b] })}
                                        className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                                        {buildingTypeLabel(b)}
                                      </button>
                                    );
                                  }) : <span className="text-xs text-muted-foreground">{it.building_types.length ? it.building_types.map(buildingTypeLabel).join(", ") : "All building types"}</span>}
                                </div>
                                {editable && it.building_types.length === 0 && <div className="mt-0.5 text-[11px] text-muted-foreground">All building types (pick to limit)</div>}
                              </td>
                              <td className="px-2 py-2">{editable && <Button size="icon" variant="ghost" onClick={() => removeItem(i)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>}</td>
                            </tr>
                          );
                        }),
                        editable && (
                          <tr key={`${p}-add`} className={cn("border-t border-border", rows.length === 0 && "bg-muted/20")}>
                            <td className="px-3 py-2 text-xs">{rows.length === 0 && <><div className="font-medium">{partLabel(p, kind)}</div><div className="text-muted-foreground">{PART_HINT[p]}</div></>}</td>
                            <td className="px-3 py-2" colSpan={3}><TemplatePicker part={p} value="" templates={templateCodes} placeholder="+ Add a template…" onChange={(code) => addItem(p, code)} /></td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              {!isLinear && missingParts.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">No template yet for: {missingParts.map((p) => partLabel(p, kind)).join(", ")}. Generate leaves those levels for the planner to fill by hand.</p>
              )}
              {kit.status !== "draft" && <p className="mt-2 text-xs text-muted-foreground">The kit is {STATUS_LABEL[kit.status].toLowerCase()} and frozen; create a new version to change its templates.</p>}
            </div>
          </div>
        )}
      </section>

      {creating && <NewKitDialog onClose={() => setCreating(false)} onCreated={(k) => { setCreating(false); void reload(k.id); }} />}
    </div>
  );
}

/** Template codes for a part: those made for the part first. */
function TemplatePicker({ part, value, templates, placeholder, onChange }: {
  part: KitPart; value: string; templates: ActTemplate[]; placeholder?: string; onChange: (code: string) => void;
}) {
  const made = templates.filter((t) => t.applies_to_level_types?.includes(part));
  const other = templates.filter((t) => !t.applies_to_level_types?.includes(part));
  const opt = (t: ActTemplate) => <option key={t.code} value={t.code}>{t.code} — {t.name}{t.status === "draft" ? " (draft)" : ""}</option>;
  return (
    <select className={cn(selectCls, "w-full")} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? "Choose a template…"}</option>
      {made.length > 0 && <optgroup label="Made for this part">{made.map(opt)}</optgroup>}
      <optgroup label="Other templates">{other.map(opt)}</optgroup>
    </select>
  );
}

/** Sectors / building types of a kit: classification, editable on any status. */
function KitSectors({ kit, canEdit, onSaved }: { kit: Kit; canEdit: boolean; onSaved: () => void }) {
  const db = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ sectors: kit.sectors, buildingTypes: kit.building_types });

  async function save() {
    try {
      await updateKitHeader(db, kit.id, { sectors: draft.sectors, building_types: draft.buildingTypes });
      toast.success("Sectors saved");
      setEditing(false);
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">Project categories this kit is for</div>
        {canEdit && !editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}
      </div>
      {editing ? (
        <>
          <SectorListFields sectors={draft.sectors} buildingTypes={draft.buildingTypes} onChange={setDraft} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setDraft({ sectors: kit.sectors, buildingTypes: kit.building_types }); setEditing(false); }}>Cancel</Button>
          </div>
        </>
      ) : (
        <div className="text-sm">
          <span className="font-medium">{sectorListLabel(kit.sectors)}</span>
          {kit.building_types.length > 0 && <span className="text-muted-foreground"> · {kit.building_types.map(buildingTypeLabel).join(", ")}</span>}
        </div>
      )}
    </div>
  );
}

function NewKitDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (k: Kit) => void }) {
  const db = useMemo(() => createClient(), []);
  const [code, setCode] = useState("KIT-");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cat, setCat] = useState({ sectors: [] as string[], buildingTypes: [] as string[] });

  async function create() {
    if (code.trim().length < 5 || !name.trim()) { toast.error("Code and name are required"); return; }
    try {
      const k = await createKit(db, {
        code: code.trim().toUpperCase(), name: name.trim(), description: description.trim() || null,
        sectors: cat.sectors, building_types: cat.buildingTypes,
      });
      toast.success(`${k.code} created as draft`);
      onCreated(k);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>New generation kit</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="KIT-RES-VILLA-2" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <SectorListFields sectors={cat.sectors} buildingTypes={cat.buildingTypes} onChange={setCat} />
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={create}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
