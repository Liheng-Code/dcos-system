"use client";

import { useEffect, useState } from "react";
import { deleteLevelNamingTemplateById, insertLevelNamingTemplateReturning, listLevelNamingTemplates, updateLevelNamingTemplateById } from "@/lib/naming/naming-queries";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NamingLevelListEditor } from "./naming-level-list-editor";
import type { LevelNamingTemplateRecord, LevelEntry } from "./naming-wbs-types";

export function NamingLevelTemplateAdmin() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<LevelNamingTemplateRecord[]>([]);
  const [editMap, setEditMap] = useState<Record<string, Partial<LevelNamingTemplateRecord> & { dirty?: boolean }>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEntries, setNewEntries] = useState<LevelEntry[]>([]);

  useEffect(() => {
    listLevelNamingTemplates().then(({ data, error }) => {
      if (data) setTemplates(data as LevelNamingTemplateRecord[]);
      if (error) toast.error("Failed to load templates");
      setLoading(false);
    });
  }, []);

  function updateField(id: string, field: string, value: unknown) {
    setEditMap((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, dirty: true } }));
  }

  function getEntries(id: string): LevelEntry[] {
    return (editMap[id]?.config as LevelEntry[] | undefined) ?? templates.find((t) => t.id === id)?.config ?? [];
  }

  function handleEntriesChange(id: string, entries: LevelEntry[]) {
    setEditMap((prev) => ({ ...prev, [id]: { ...prev[id], config: entries, dirty: true } }));
  }

  async function handleSave(id: string) {
    const changes = editMap[id];
    if (!changes?.dirty) return;
    const payload: Record<string, unknown> = {};
    if (changes.template_name !== undefined) payload.template_name = changes.template_name;
    if (changes.description !== undefined) payload.description = changes.description;
    if (changes.config !== undefined) payload.config = changes.config;
    if (changes.is_active !== undefined) payload.is_active = changes.is_active;
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    const { error } = await updateLevelNamingTemplateById(payload, id);
    if (error) {
      toast.error(error.message);
    } else {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } as LevelNamingTemplateRecord : t)));
      setEditMap((prev) => { const { [id]: _, ...rest } = prev; return rest; });
      toast.success("Template updated");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this level naming template?")) return;
    setSaving(true);
    const { error } = await deleteLevelNamingTemplateById(id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setSaving(false);
    toast.success("Template deleted");
  }

  async function handleToggleActive(id: string, current: boolean) {
    setSaving(true);
    const { error } = await updateLevelNamingTemplateById({ is_active: !current }, id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: !current } as LevelNamingTemplateRecord : t)));
    setSaving(false);
  }

  async function handleAdd() {
    if (!newName.trim()) { toast.error("Template name is required"); return; }
    if (newEntries.length === 0) { toast.error("Add at least one level"); return; }
    setSaving(true);
    const { data, error } = await insertLevelNamingTemplateReturning({
      template_name: newName.trim(),
      description: newDesc.trim() || null,
      config: newEntries,
    });
    if (error) {
      toast.error(error.message);
    } else if (data) {
      setTemplates((prev) => [...prev, data as LevelNamingTemplateRecord]);
      setShowAdd(false);
      setNewName("");
      setNewDesc("");
      setNewEntries([]);
      toast.success("Template added");
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Level naming templates define the ordered list of floor levels with their codes and display names.
      </p>
      <div className="space-y-3">
        {templates.map((t) => {
          const entries = getEntries(t.id);
          return (
            <div key={t.id} className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2.5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    value={editMap[t.id]?.template_name ?? t.template_name}
                    onChange={(e) => updateField(t.id, "template_name", e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-sm font-semibold outline-hidden focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleToggleActive(t.id, t.is_active)}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      t.is_active
                        ? "bg-green-50 text-green-700 hover:bg-green-100"
                        : "bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    {t.is_active ? "Active" : "Inactive"}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleSave(t.id)} disabled={!editMap[t.id]?.dirty || saving}>
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Description</span>
                  <input
                    value={editMap[t.id]?.description ?? t.description ?? ""}
                    onChange={(e) => updateField(t.id, "description", e.target.value)}
                    placeholder="No description"
                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Levels ({entries.length})</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {entries.map((e) => e.code || "?").join(" → ")}
                    </span>
                  </div>
                  <NamingLevelListEditor
                    entries={entries}
                    onChange={(e) => handleEntriesChange(t.id, e)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showAdd ? (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <h4 className="text-sm font-medium">New Level Naming Template</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Template Name *</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. European Convention"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Description</span>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
              />
            </div>
          </div>
          <NamingLevelListEditor
            entries={newEntries}
            onChange={setNewEntries}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create Template
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewEntries([]); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Template
        </Button>
      )}
    </div>
  );
}
