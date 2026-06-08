"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface DisciplineCode {
  id: string;
  code: string;
  name: string;
  source: string;
  is_active: boolean;
  sort_order: number;
}

export function NamingDisciplineCodes() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [codes, setCodes] = useState<DisciplineCode[]>([]);
  const [editMap, setEditMap] = useState<Record<string, Partial<DisciplineCode>>>({});
  const [newCode, setNewCode] = useState({ code: "", name: "" });

  useEffect(() => {
    supabase.from("discipline_codes").select("*").order("sort_order").then(({ data, error }) => {
      if (data) setCodes(data as DisciplineCode[]);
      if (error) toast.error("Failed to load discipline codes");
      setLoading(false);
    });
  }, [supabase]);

  function updateField(id: string, field: keyof DisciplineCode, value: string | boolean) {
    setEditMap((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function handleSave(id: string) {
    const changes = editMap[id];
    if (!changes) return;
    setSaving(true);
    const { error } = await supabase.from("discipline_codes").update(changes).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
      setEditMap((prev) => { const { [id]: _, ...rest } = prev; return rest; });
      toast.success("Discipline code updated");
    }
    setSaving(false);
  }

  async function handleToggleActive(id: string, current: boolean) {
    const { error } = await supabase.from("discipline_codes").update({ is_active: !current }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: !current } : c)));
  }

  async function handleAdd() {
    if (!newCode.code || !newCode.name) { toast.error("Code and name are required"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("discipline_codes").insert({
      code: newCode.code.toUpperCase(),
      name: newCode.name,
      source: "frontend",
      sort_order: codes.length + 1,
    }).select().single();
    if (error) {
      toast.error(error.message);
    } else if (data) {
      setCodes((prev) => [...prev, data as DisciplineCode]);
      setNewCode({ code: "", name: "" });
      toast.success("Discipline code added");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this discipline code?")) return;
    const { error } = await supabase.from("discipline_codes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCodes((prev) => prev.filter((c) => c.id !== id));
    toast.success("Discipline code deleted");
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {codes.length} discipline codes configured ({codes.filter((c) => c.is_active).length} active)
        </p>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Code</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Source</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Active</th>
              <th className="w-24 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2">
                  <input
                    value={editMap[code.id]?.code ?? code.code}
                    onChange={(e) => updateField(code.id, "code", e.target.value.toUpperCase())}
                    className="w-20 rounded border border-border bg-background px-2 py-1 font-mono text-sm outline-hidden focus:border-primary"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={editMap[code.id]?.name ?? code.name}
                    onChange={(e) => updateField(code.id, "name", e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-hidden focus:border-primary"
                  />
                </td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {code.source}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(code.id, code.is_active)}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      code.is_active
                        ? "bg-green-50 text-green-700 hover:bg-green-100"
                        : "bg-red-50 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    {code.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSave(code.id)}
                      disabled={!editMap[code.id] || saving}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(code.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="border-t border-border">
              <td className="px-4 py-2">
                <input
                  value={newCode.code}
                  onChange={(e) => setNewCode((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. EHS"
                  className="w-20 rounded border border-border bg-background px-2 py-1 font-mono text-sm outline-hidden focus:border-primary"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  value={newCode.name}
                  onChange={(e) => setNewCode((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Environment, Health & Safety"
                  className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-hidden focus:border-primary"
                />
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">New</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2">
                <Button size="sm" variant="outline" onClick={handleAdd} disabled={saving}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
