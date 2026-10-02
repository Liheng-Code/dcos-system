"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getExcludeItems, createExcludeItem, updateExcludeItem, deleteExcludeItem,
  type TenderExcludeItem,
} from "@/lib/qs/tender-cost-service";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";

export function ExcludeItemsTab({ tenderId }: { tenderId: string }) {
  const [items, setItems] = useState<TenderExcludeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ item_code: "", description: "", reason: "" });

  const { can } = useTenderPermissions();
  const isEditing = editingId !== null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getExcludeItems(tenderId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load exclude items");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setSaving(true);
    try {
      await createExcludeItem({
        tender_id: tenderId,
        item_code: form.item_code,
        description: form.description,
        reason: form.reason || null,
      });
      toast.success("Exclude item added");
      setForm({ item_code: "", description: "", reason: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    try {
      await updateExcludeItem(id, {
        description: form.description,
        reason: form.reason || null,
      });
      toast.success("Exclude item updated");
      closePanel();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteExcludeItem(id);
      toast.success("Item deleted");
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (editingId === id) closePanel();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(item: TenderExcludeItem) {
    setEditingId(item.id);
    setForm({ item_code: item.item_code, description: item.description, reason: item.reason ?? "" });
  }

  function closePanel() {
    setEditingId(null);
    setForm({ item_code: "", description: "", reason: "" });
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* Left: Items List */}
      <div className={`flex-1 flex flex-col gap-3 ${isEditing ? "max-w-[55%]" : ""}`}>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{items.length} item(s)</p>
          {!isEditing && can("tender_exclude_items", "can_create") && (
            <Button size="sm" variant="outline" onClick={() => {
              setEditingId("new");
              setForm({ item_code: "", description: "", reason: "" });
            }}>
              <Plus className="mr-1 h-4 w-4" /> Add Item
            </Button>
          )}
        </div>

        {items.length === 0 && !isEditing ? (
          <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No exclude items added</div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Item Code</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-left px-3 py-2 font-medium">Reason</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id} className={editingId === item.id ? "bg-primary/5" : ""}>
                    <td className="px-3 py-2 font-mono text-xs">{item.item_code}</td>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{item.reason ?? "—"}</td>
                    <td className="px-3 py-2 flex gap-1 justify-end">
                      {can("tender_exclude_items", "edit") && (
                        <button onClick={() => startEdit(item)} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {can("tender_exclude_items", "delete") && (
                        <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === item.id}>
                          {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: Edit / Create Panel */}
      {isEditing && (
        <div className="w-[45%] border border-border rounded-lg bg-card p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingId === "new" ? "New Exclude Item" : "Edit Exclude Item"}</h3>
            <button onClick={closePanel} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-3 flex-1">
            <div className="space-y-1">
              <label className="text-xs font-medium">Item Code *</label>
              <input value={form.item_code} onChange={(e) => setForm({ ...form, item_code: e.target.value })}
                disabled={editingId !== "new"}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50" placeholder="EX.01" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Description *</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Reason for Exclusion</label>
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={closePanel}>Cancel</Button>
            <Button size="sm" onClick={() => editingId === "new" ? handleCreate() : handleUpdate(editingId)}
              disabled={saving || !form.item_code.trim() || !form.description.trim()}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{editingId === "new" ? "Add" : "Update"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
