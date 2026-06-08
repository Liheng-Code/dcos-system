"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BoqSectionForm({ section: rawSection, projectId, onSaved, onCancel }: { section: any; projectId: string; onSaved: (section: any) => void; onCancel: () => void }) {
  const section = rawSection ?? {};
  const [code, setCode] = useState((section.section_code as string) ?? "");
  const [name, setName] = useState((section.title as string) ?? "");
  const [seq, setSeq] = useState((section.seq as number) ?? 0);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) { toast.error("Code and name are required"); return; }
    setSaving(true);
    const supabase = createClient();

    if (section) {
      const { data, error } = await supabase.from("qs_boq_sections").update({ section_code: code.trim(), title: name.trim(), seq }).eq("id", section.id).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Section updated");
      onSaved(data);
    } else {
      const { data, error } = await supabase.from("qs_boq_sections").insert([{ project_id: projectId, section_code: code.trim(), title: name.trim(), seq }]).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Section created");
      onSaved(data);
    }
    setSaving(false);
  }

  return (
    <Card className="mb-4">
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">{section ? "Edit Section" : "New Section"}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Section Code</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. A" />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Substructure" />
            </div>
            <div className="space-y-1.5">
              <Label>Seq</Label>
              <Input type="number" value={seq} onChange={e => setSeq(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {section ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
