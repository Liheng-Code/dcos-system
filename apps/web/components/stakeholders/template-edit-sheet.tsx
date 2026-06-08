"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X, Loader2, Save, Plus, Trash2, Pencil, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface StakeholderTemplate {
  id: string;
  name: string;
  description: string | null;
  placeholders?: TemplatePlaceholder[];
  created_at: string;
  updated_at: string;
}

export interface TemplatePlaceholder {
  id: string;
  template_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  teams: TemplatePlaceholderTeam[];
}

export interface TemplatePlaceholderTeam {
  id: string;
  placeholder_id: string;
  name: string;
  description: string | null;
}

interface PlaceholderFormData {
  label: string;
  description: string;
  teams: { _id?: string; name: string; description: string }[];
}

const EMPTY_PLACEHOLDER_FORM: PlaceholderFormData = {
  label: "",
  description: "",
  teams: [],
};

interface TemplateEditSheetProps {
  template: StakeholderTemplate | null;
  onClose: () => void;
  onSave: (template: StakeholderTemplate) => void;
}

export function TemplateEditSheet({ template, onClose, onSave }: TemplateEditSheetProps) {
  const [form, setForm] = useState({
    name: template?.name ?? "",
    description: template?.description ?? "",
  });
  const [placeholders, setPlaceholders] = useState<(TemplatePlaceholder & { _teamsToRemove?: string[] })[]>(
    template?.placeholders ?? [],
  );
  const [removedPlaceholderIds, setRemovedPlaceholderIds] = useState<string[]>([]);
  const [placeholderForm, setPlaceholderForm] = useState<PlaceholderFormData>(EMPTY_PLACEHOLDER_FORM);
  const [editingPlaceholderId, setEditingPlaceholderId] = useState<string | null>(null);
  const [showPlaceholderForm, setShowPlaceholderForm] = useState(false);
  const [expandedPlaceholder, setExpandedPlaceholder] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = !!template;

  let tempIdCounter = 0;
  function nextTempId() {
    tempIdCounter += 1;
    return `new_${Date.now()}_${tempIdCounter}`;
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddPlaceholder() {
    setPlaceholderForm(EMPTY_PLACEHOLDER_FORM);
    setEditingPlaceholderId(null);
    setShowPlaceholderForm(true);
  }

  function handleEditPlaceholder(ph: TemplatePlaceholder) {
    setPlaceholderForm({
      label: ph.label,
      description: ph.description ?? "",
      teams: ph.teams.map((t) => ({ _id: t.id, name: t.name, description: t.description ?? "" })),
    });
    setEditingPlaceholderId(ph.id);
    setShowPlaceholderForm(true);
  }

  function handleCancelPlaceholderForm() {
    setShowPlaceholderForm(false);
    setEditingPlaceholderId(null);
    setPlaceholderForm(EMPTY_PLACEHOLDER_FORM);
  }

  function handlePlaceholderTeamAdd() {
    setPlaceholderForm((prev) => ({
      ...prev,
      teams: [...prev.teams, { name: "", description: "" }],
    }));
  }

  function handlePlaceholderTeamRemove(index: number) {
    setPlaceholderForm((prev) => ({
      ...prev,
      teams: prev.teams.filter((_, i) => i !== index),
    }));
  }

  function handlePlaceholderTeamChange(index: number, field: string, value: string) {
    setPlaceholderForm((prev) => ({
      ...prev,
      teams: prev.teams.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  }

  function handleSavePlaceholder() {
    if (!placeholderForm.label.trim()) return;

    if (editingPlaceholderId) {
      setPlaceholders((prev) =>
        prev.map((ph) => {
          if (ph.id !== editingPlaceholderId) return ph;
          const updated: TemplatePlaceholder = {
            ...ph,
            label: placeholderForm.label.trim(),
            description: placeholderForm.description || null,
            teams: placeholderForm.teams.map((t, i) => ({
              id: t._id ?? `new_${Date.now()}_${i}`,
              placeholder_id: ph.id,
              name: t.name,
              description: t.description || null,
            })),
          };
          return updated;
        }),
      );
    } else {
      const newId = nextTempId();
      const newPh: TemplatePlaceholder = {
        id: newId,
        template_id: "",
        label: placeholderForm.label.trim(),
        description: placeholderForm.description || null,
        sort_order: placeholders.length,
        teams: placeholderForm.teams.map((t, i) => ({
          id: `new_${Date.now()}_${i}`,
          placeholder_id: newId,
          name: t.name,
          description: t.description || null,
        })),
      };
      setPlaceholders((prev) => [...prev, newPh]);
    }

    setShowPlaceholderForm(false);
    setEditingPlaceholderId(null);
    setPlaceholderForm(EMPTY_PLACEHOLDER_FORM);
  }

  function handleRemovePlaceholder(id: string) {
    if (!id.startsWith("new_")) {
      setRemovedPlaceholderIds((prev) => [...prev, id]);
    }
    setPlaceholders((prev) => prev.filter((ph) => ph.id !== id));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name: form.name.trim(),
      description: form.description || null,
    };

    let templateId: string;

    if (isEditing) {
      const { error } = await supabase.from("stakeholder_templates").update(payload).eq("id", template.id).select().single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      templateId = template.id;
    } else {
      const { data, error } = await supabase.from("stakeholder_templates").insert(payload).select().single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      templateId = data.id;
    }

    // Delete removed placeholders
    for (const phId of removedPlaceholderIds) {
      await supabase.from("template_placeholders").delete().eq("id", phId);
    }

    // Upsert placeholders and their teams
    let sortOrder = 0;
    for (const ph of placeholders) {
      sortOrder += 1;
      const phPayload = {
        template_id: templateId,
        label: ph.label,
        description: ph.description,
        sort_order: sortOrder,
      };

      let phId: string;
      let isNew = ph.id.startsWith("new_");

      if (isNew) {
        const { data: phData, error: phErr } = await supabase
          .from("template_placeholders")
          .insert(phPayload)
          .select()
          .single();
        if (phErr) {
          toast.error(`Failed to add placeholder: ${phErr.message}`);
          continue;
        }
        phId = phData.id;
      } else {
        const { error: phErr } = await supabase
          .from("template_placeholders")
          .update(phPayload)
          .eq("id", ph.id);
        if (phErr) {
          toast.error(`Failed to update placeholder: ${phErr.message}`);
          continue;
        }
        phId = ph.id;
      }

      // Upsert teams for this placeholder
      for (const team of ph.teams) {
        const teamPayload = {
          placeholder_id: phId,
          name: team.name,
          description: team.description,
        };

        if (team.id.startsWith("new_")) {
          const { error: teamErr } = await supabase.from("template_placeholder_teams").insert(teamPayload);
          if (teamErr) {
            toast.error(`Failed to add team: ${teamErr.message}`);
          }
        } else {
          const { error: teamErr } = await supabase.from("template_placeholder_teams").update(teamPayload).eq("id", team.id);
          if (teamErr) {
            toast.error(`Failed to update team: ${teamErr.message}`);
          }
        }
      }
    }

    toast.success(isEditing ? "Template updated" : "Template created");

    const saved: StakeholderTemplate = {
      id: templateId,
      name: form.name.trim(),
      description: form.description || null,
      placeholders: placeholders.map((ph) => ({
        id: ph.id,
        template_id: templateId,
        label: ph.label,
        description: ph.description,
        sort_order: ph.sort_order,
        teams: ph.teams.map((t) => ({
          id: t.id,
          placeholder_id: ph.id,
          name: t.name,
          description: t.description,
        })),
      })),
      created_at: "",
      updated_at: "",
    };

    onSave(saved);
    setSaving(false);
  }

  const placeholderCount = placeholders.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-background border-l border-border shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {isEditing ? form.name : "New Template"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isEditing ? `${placeholderCount} placeholder${placeholderCount !== 1 ? "s" : ""}` : "Create a reusable stakeholder template"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {/* Template Info */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Template Info
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="template_name">Name *</Label>
              <input
                id="template_name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Standard High-Rise Project"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template_desc">Description</Label>
              <textarea
                id="template_desc"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={2}
                placeholder="Describe the project type this template is for"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none"
              />
            </div>
          </fieldset>

          {/* Placeholders */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Company Placeholders
            </legend>

            {placeholders.length === 0 && !showPlaceholderForm ? (
              <p className="text-xs text-muted-foreground py-2">
                No placeholders yet. Add company roles like Client/Owner, Consultant, Contractor.
              </p>
            ) : (
              <div className="space-y-2">
                {placeholders.map((ph) => (
                  <div
                    key={ph.id}
                    className="rounded-md border border-border bg-muted/30"
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setExpandedPlaceholder(expandedPlaceholder === ph.id ? null : ph.id)}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {expandedPlaceholder === ph.id ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <span className="flex-1 text-sm font-medium">{ph.label}</span>
                      {ph.teams.length > 0 && (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {ph.teams.length} team{ph.teams.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditPlaceholder(ph)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePlaceholder(ph.id)}
                        className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {expandedPlaceholder === ph.id && ph.teams.length > 0 && (
                      <div className="border-t border-border px-6 py-2 space-y-1">
                        {ph.teams.map((team) => (
                          <div key={team.id} className="text-xs text-muted-foreground flex items-center gap-2">
                            <span className="text-foreground">{team.name}</span>
                            {team.description && (
                              <span className="text-muted-foreground/60">— {team.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Placeholder Add/Edit Form */}
            {showPlaceholderForm && (
              <div className="space-y-2.5 rounded-md border border-border bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ph_label">Label *</Label>
                  <input
                    id="ph_label"
                    value={placeholderForm.label}
                    onChange={(e) => setPlaceholderForm({ ...placeholderForm, label: e.target.value })}
                    placeholder="e.g. Client/Owner"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ph_desc">Description</Label>
                  <input
                    id="ph_desc"
                    value={placeholderForm.description}
                    onChange={(e) => setPlaceholderForm({ ...placeholderForm, description: e.target.value })}
                    placeholder="e.g. The project owner or client organization"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                  />
                </div>

                {/* Teams within this placeholder */}
                <div className="pt-1">
                  <span className="text-xs font-medium text-muted-foreground">Teams</span>
                  <div className="mt-1.5 space-y-2">
                    {placeholderForm.teams.map((team, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <input
                            value={team.name}
                            onChange={(e) => handlePlaceholderTeamChange(i, "name", e.target.value)}
                            placeholder="Team name"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-hidden focus:border-primary"
                          />
                          <input
                            value={team.description}
                            onChange={(e) => handlePlaceholderTeamChange(i, "description", e.target.value)}
                            placeholder="Description"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-hidden focus:border-primary"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePlaceholderTeamRemove(i)}
                          className="rounded p-1 text-muted-foreground hover:text-red-600 mt-0.5 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handlePlaceholderTeamAdd}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add Team
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCancelPlaceholderForm}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePlaceholder}
                    disabled={!placeholderForm.label.trim()}
                    className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {editingPlaceholderId ? "Update Placeholder" : "Add Placeholder"}
                  </button>
                </div>
              </div>
            )}

            {!showPlaceholderForm && (
              <button
                type="button"
                onClick={handleAddPlaceholder}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Company Placeholder
              </button>
            )}
          </fieldset>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Save className="mr-1.5 h-4 w-4" />
            {isEditing ? "Save Changes" : "Create Template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
