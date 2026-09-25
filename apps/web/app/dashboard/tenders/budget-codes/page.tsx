"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { Loader2, Plus, Trash2, ListTree, Pencil, X, ChevronDown, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getBudgetCodeTree, createBudgetCode, deleteBudgetCode, updateBudgetCode,
  type BudgetCodeGroupTree,
} from "@/lib/tender-cost-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { BudgetCodeExternalRefs } from "@/components/tenders/budget-code-external-refs";

export default function BudgetCodesPage() {
  const { can, loaded: permsLoaded } = useQsPermissions();
  const [tree, setTree] = useState<BudgetCodeGroupTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", code_letter: "A", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ code: "", code_letter: "", description: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTree(await getBudgetCodeTree());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load budget codes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Quiet reload after an external-ref change (no full-page spinner).
  const refreshTree = useCallback(() => {
    getBudgetCodeTree()
      .then(setTree)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to reload budget codes"));
  }, []);

  const refsPerms = {
    canCreate: can("qs_libraries", "can_create"),
    canEdit: can("qs_libraries", "edit"),
    canDelete: can("qs_libraries", "delete"),
  };

  async function handleCreate() {
    setSaving(true);
    try {
      await createBudgetCode({
        code: form.code,
        code_letter: form.code_letter,
        description: form.description,
        code_level: form.code.split(".").length >= 3 ? 3 : 2,
      });
      toast.success("Budget code added");
      setShowForm(false);
      setForm({ code: "", code_letter: "A", description: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add budget code");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteBudgetCode(id);
      toast.success("Budget code deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete budget code");
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(id: string, code: string, code_letter: string, description: string) {
    setEditingId(id);
    setEditForm({ code, code_letter, description });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ code: "", code_letter: "", description: "" });
  }

  async function handleUpdate() {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      await updateBudgetCode(editingId, {
        code_letter: editForm.code_letter,
        description: editForm.description,
      });
      toast.success("Budget code updated");
      cancelEdit();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update budget code");
    } finally {
      setSavingEdit(false);
    }
  }

  function toggleGroup(letter: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  }

  const allCollapsed = tree.length > 0 && tree.every(({ group }) => collapsedGroups.has(group.code_letter));

  function toggleAll() {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(tree.map(({ group }) => group.code_letter)));
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budget Codes</h1>
          <p className="text-sm text-muted-foreground">Enterprise-wide elemental cost classification (A.00–Z.70), reused across all tenders. External refs cross-reference a code to MasterFormat, UniFormat, NRM or DIN 276.</p>
        </div>
        <div className="flex items-center gap-2">
          {tree.length > 0 && (
            <Button size="sm" variant="ghost" onClick={toggleAll}>
              {allCollapsed ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
              {allCollapsed ? "Expand All" : "Collapse All"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} disabled={!can("qs_libraries", "can_create")}>
            <Plus className="mr-1 h-4 w-4" /> Add Code
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Code *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. B.05" /></div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Group Letter *</label>
                <select value={form.code_letter} onChange={(e) => setForm({ ...form, code_letter: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {tree.map((g) => <option key={g.group.code_letter} value={g.group.code_letter}>{g.group.code_letter} — {g.group.name}</option>)}
                </select>
              </div>
              <div className="col-span-3 space-y-1"><label className="text-xs font-medium">Description *</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.code.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {tree.map(({ group, codes }) => {
          const collapsed = collapsedGroups.has(group.code_letter);
          const totalCodes = codes.length + codes.reduce((sum, c) => sum + c.children.length, 0);
          return (
            <div key={group.code_letter} className="rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGroup(group.code_letter)}
                className="w-full bg-muted/50 px-4 py-2 flex items-center gap-2 hover:bg-muted/70 transition-colors cursor-pointer"
              >
                {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                <ListTree className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-semibold text-left">{group.code_letter} — {group.name}</p>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{totalCodes} {totalCodes === 1 ? "code" : "codes"}</span>
              </button>
              {!collapsed && (
                codes.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">No codes yet</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {codes.map((c) => (
                        <Fragment key={c.id}>
                          {editingId === c.id ? (
                            <tr>
                              <td className="px-4 py-1.5 font-mono text-xs w-24">{c.code}</td>
                              <td className="px-4 py-1.5" colSpan={2}>
                                <div className="flex flex-col gap-1.5">
                                  <select value={editForm.code_letter} onChange={(e) => setEditForm({ ...editForm, code_letter: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
                                    {tree.map((g) => <option key={g.group.code_letter} value={g.group.code_letter}>{g.group.code_letter} — {g.group.name}</option>)}
                                  </select>
                                  <input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
                                </div>
                              </td>
                              <td className="px-4 py-1.5 w-20">
                                <div className="flex items-center gap-1">
                                  <button onClick={handleUpdate} className="text-muted-foreground hover:text-green-600" disabled={savingEdit || !editForm.description.trim()}>
                                    {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  </button>
                                  <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr>
                              <td className="px-4 py-1.5 font-mono text-xs w-24">{c.code}</td>
                              <td className="px-4 py-1.5">{c.description}</td>
                              <td className="px-4 py-1.5 w-[38%]">
                                <BudgetCodeExternalRefs budgetCodeId={c.id} refs={c.external_refs} {...refsPerms} onChanged={refreshTree} />
                              </td>
                              <td className="px-4 py-1.5 w-20">
                                <div className="flex items-center gap-1">
                                  {can("qs_libraries", "edit") && (
                                    <button onClick={() => startEdit(c.id, c.code, c.code_letter, c.description)} className="text-muted-foreground hover:text-blue-600">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {can("qs_libraries", "delete") && (
                                    <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === c.id}>
                                      {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          {c.children.map((child) => (
                            <tr key={child.id} className="bg-muted/20">
                              {editingId === child.id ? (
                                <>
                                  <td className="px-4 py-1.5 pl-8 font-mono text-xs w-24">{child.code}</td>
                                  <td className="px-4 py-1.5" colSpan={2}>
                                    <div className="flex flex-col gap-1.5">
                                      <select value={editForm.code_letter} onChange={(e) => setEditForm({ ...editForm, code_letter: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-xs">
                                        {tree.map((g) => <option key={g.group.code_letter} value={g.group.code_letter}>{g.group.code_letter} — {g.group.name}</option>)}
                                      </select>
                                      <input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                                    </div>
                                  </td>
                                  <td className="px-4 py-1.5 w-20">
                                    <div className="flex items-center gap-1">
                                      <button onClick={handleUpdate} className="text-muted-foreground hover:text-green-600" disabled={savingEdit || !editForm.description.trim()}>
                                        {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                      </button>
                                      <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-4 py-1.5 pl-8 font-mono text-xs w-24">{child.code}</td>
                                  <td className="px-4 py-1.5 text-xs">{child.description}</td>
                                  <td className="px-4 py-1.5 w-[38%]">
                                    <BudgetCodeExternalRefs budgetCodeId={child.id} refs={child.external_refs} {...refsPerms} onChanged={refreshTree} />
                                  </td>
                                  <td className="px-4 py-1.5 w-20">
                                    <div className="flex items-center gap-1">
                                      {can("qs_libraries", "edit") && (
                                        <button onClick={() => startEdit(child.id, child.code, child.code_letter, child.description)} className="text-muted-foreground hover:text-blue-600">
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {can("qs_libraries", "delete") && (
                                        <button onClick={() => handleDelete(child.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === child.id}>
                                          {deletingId === child.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
