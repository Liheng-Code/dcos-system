"use client";

import { useEffect, useState } from "react";
import { deleteBudgetPackageSectionById, insertBudgetPackageSectionReturning, listBudgetPackageSections, updateBudgetPackageSectionById } from "@/lib/naming/naming-queries";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface BudgetSection {
  id: string;
  group_code: string;
  group_name: string;
  section: string;
  section_name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

const GROUPS = ["A", "B", "C", "D", "E", "F"] as const;
const GROUP_NAMES: Record<string, string> = {
  A: "Early Works",
  B: "Sub-Structure",
  C: "Architecture External",
  D: "Interior Finishes",
  E: "Fittings & Equipment",
  F: "Building Services (MEP)",
};

export function NamingBudgetSectionsEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<BudgetSection[]>([]);
  const [editMap, setEditMap] = useState<Record<string, Partial<BudgetSection>>>({});
  const [newSection, setNewSection] = useState({ group_code: "A" as string, section: "", section_name: "", description: "" });

  useEffect(() => {
    listBudgetPackageSections().then(({ data, error }) => {
      if (data) setSections(data as BudgetSection[]);
      if (error) toast.error("Failed to load budget sections");
      setLoading(false);
    });
  }, []);

  function updateField(id: string, field: keyof BudgetSection, value: string | boolean) {
    setEditMap((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function handleSave(id: string) {
    const changes = editMap[id];
    if (!changes) return;
    setSaving(true);
    const { error } = await updateBudgetPackageSectionById(changes, id);
    if (error) {
      toast.error(error.message);
    } else {
      setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)));
      setEditMap((prev) => { const { [id]: _, ...rest } = prev; return rest; });
      toast.success("Section updated");
    }
    setSaving(false);
  }

  async function handleAdd() {
    if (!newSection.section || !newSection.section_name) {
      toast.error("Section code and name are required");
      return;
    }
    setSaving(true);
    const fullSection = `${newSection.group_code}.${newSection.section}`;
    const maxOrder = sections
      .filter((s) => s.group_code === newSection.group_code)
      .reduce((max, s) => Math.max(max, s.sort_order), 0);
    const baseOrder = sections.reduce((max, s) => Math.max(max, s.sort_order), 0) + 1;
    const { data, error } = await insertBudgetPackageSectionReturning({
      group_code: newSection.group_code,
      group_name: GROUP_NAMES[newSection.group_code],
      section: fullSection,
      section_name: newSection.section_name,
      description: newSection.description || null,
      sort_order: baseOrder,
    });
    if (error) {
      toast.error(error.message);
    } else if (data) {
      setSections((prev) => [...prev, data as BudgetSection]);
      setNewSection({ group_code: "A", section: "", section_name: "", description: "" });
      toast.success("Section added");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this budget section?")) return;
    const { error } = await deleteBudgetPackageSectionById(id);
    if (error) { toast.error(error.message); return; }
    setSections((prev) => prev.filter((s) => s.id !== id));
    toast.success("Section deleted");
  }

  async function handleToggleActive(id: string, current: boolean) {
    const { error } = await updateBudgetPackageSectionById({ is_active: !current }, id);
    if (error) { toast.error(error.message); return; }
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !current } : s)));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Budget package groups A–F follow the convention. Each section can be added, renamed, or reordered.
      </p>
      {GROUPS.map((group) => {
        const groupSections = sections.filter((s) => s.group_code === group);
        return (
          <div key={group} className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2.5 border-b border-border">
              <h3 className="text-sm font-semibold">
                Group {group} — {GROUP_NAMES[group]}
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Section</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Active</th>
                  <th className="w-20 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {groupSections.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{s.section}</td>
                    <td className="px-4 py-2">
                      <input
                        value={editMap[s.id]?.section_name ?? s.section_name}
                        onChange={(e) => updateField(s.id, "section_name", e.target.value)}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-hidden focus:border-primary"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editMap[s.id]?.description ?? s.description ?? ""}
                        onChange={(e) => updateField(s.id, "description", e.target.value)}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-hidden focus:border-primary"
                        placeholder="No description"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(s.id, s.is_active)}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          s.is_active
                            ? "bg-green-50 text-green-700 hover:bg-green-100"
                            : "bg-red-50 text-red-700 hover:bg-red-100"
                        }`}
                      >
                        {s.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSave(s.id)}
                          disabled={!editMap[s.id] || saving}
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="rounded-lg border border-border p-4">
        <h4 className="text-sm font-medium mb-3">Add New Section</h4>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Group</span>
            <select
              value={newSection.group_code}
              onChange={(e) => setNewSection((prev) => ({ ...prev, group_code: e.target.value }))}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
            >
              {GROUPS.map((g) => (
                <option key={g} value={g}>Group {g} — {GROUP_NAMES[g]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Number</span>
            <input
              value={newSection.section}
              onChange={(e) => setNewSection((prev) => ({ ...prev, section: e.target.value }))}
              placeholder="e.g. 13"
              className="w-20 rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Section Name</span>
            <input
              value={newSection.section_name}
              onChange={(e) => setNewSection((prev) => ({ ...prev, section_name: e.target.value }))}
              placeholder="e.g. Solar Panel Installation"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Description</span>
            <input
              value={newSection.description}
              onChange={(e) => setNewSection((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
            />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={saving}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
