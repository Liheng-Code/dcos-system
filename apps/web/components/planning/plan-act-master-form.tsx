"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { createMaster, updateMaster, type LibraryTree } from "@/lib/planning/activity-library/library-service";
import type { ActMaster } from "@/lib/planning/activity-library/types";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Create a draft Activity Master, or edit one that is still draft. Codes are fixed once created. */
export function PlanActMasterForm({
  tree, master, defaultFamilyId, onClose, onSaved,
}: {
  tree: LibraryTree;
  master?: ActMaster;
  defaultFamilyId?: string;
  onClose: () => void;
  onSaved: (m?: ActMaster) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const orderedFamilies = useMemo(() => {
    const dom = new Map(tree.domains.map((d) => [d.id, d.sort_order]));
    const cat = new Map(tree.categories.map((c) => [c.id, { so: c.sort_order, d: c.domain_id }]));
    const key = (f: (typeof tree.families)[number]) => {
      const c = cat.get(f.category_id);
      return [dom.get(c?.d ?? "") ?? 0, c?.so ?? 0, f.sort_order] as const;
    };
    return [...tree.families].sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
  }, [tree]);
  const [form, setForm] = useState({
    code: master?.code ?? "",
    name: master?.name ?? "",
    description: master?.description ?? "",
    family_id: master?.family_id ?? defaultFamilyId ?? orderedFamilies[0]?.id ?? "",
    discipline: master?.discipline ?? "",
    work_type: master?.work_type ?? "",
    default_unit: master?.default_unit ?? "",
    owner: master?.owner ?? "",
    source: master?.source ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const familyLabel = (fid: string) => {
    const f = tree.families.find((x) => x.id === fid);
    const c = tree.categories.find((x) => x.id === f?.category_id);
    const d = tree.domains.find((x) => x.id === c?.domain_id);
    return [d?.name, c?.name, f?.name].filter(Boolean).join(" → ");
  };

  async function save() {
    const code = form.code.trim().toUpperCase();
    if (!code || !form.name.trim()) { toast.error("Code and name are required"); return; }
    const fam = tree.families.find((f) => f.id === form.family_id);
    const cat = tree.categories.find((c) => c.id === fam?.category_id);
    if (!fam || !cat) { toast.error("Choose a family"); return; }
    const nz = (s: string) => (s.trim() ? s.trim() : null);
    setSaving(true);
    try {
      const common = {
        name: form.name.trim(), description: nz(form.description), discipline: nz(form.discipline), work_type: nz(form.work_type),
        default_unit: nz(form.default_unit), owner: nz(form.owner), source: nz(form.source),
        domain_id: cat.domain_id, category_id: cat.id, family_id: fam.id,
      };
      if (master) { await updateMaster(supabase, master.id, common); toast.success("Saved"); onSaved(); }
      else { const m = await createMaster(supabase, { code, ...common }); toast.success(`${m.code} created as draft`); onSaved(m); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{master ? `Edit ${master.code}` : "New Activity Master"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Code</Label><Input value={form.code} disabled={!!master} placeholder="STR-RC-SLAB-011" onChange={set("code")} /></div>
          <div><Label>Default unit</Label><Input value={form.default_unit} placeholder="m³" onChange={set("default_unit")} /></div>
          <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={set("name")} /></div>
          <div className="col-span-2">
            <Label>Family</Label>
            <select className={selectCls} value={form.family_id} onChange={set("family_id")}>
              {orderedFamilies.map((f) => <option key={f.id} value={f.id}>{familyLabel(f.id)}</option>)}
            </select>
          </div>
          <div><Label>Discipline</Label><Input value={form.discipline} placeholder="STR" onChange={set("discipline")} /></div>
          <div><Label>Work type</Label><Input value={form.work_type} placeholder="Concrete Works" onChange={set("work_type")} /></div>
          <div><Label>Owner</Label><Input value={form.owner} onChange={set("owner")} /></div>
          <div><Label>Source</Label><Input value={form.source} onChange={set("source")} /></div>
          <div className="col-span-2">
            <Label>Description</Label>
            <textarea className="min-h-20 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={form.description} onChange={set("description")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
