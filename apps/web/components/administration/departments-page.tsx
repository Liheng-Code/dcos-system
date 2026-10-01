"use client";

import { useEffect, useMemo, useState } from "react";
import { countProfilesByDepartmentId, deleteDepartmentById, insertDepartments, listDepartmentsOrderedByDepartmentName, listProfiles, updateDepartmentById } from "@/lib/administration/administration-queries";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Building2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface Department {
  id: string;
  department_code: string;
  department_name: string;
  description: string | null;
  parent_id: string | null;
  department_head: string | null;
}

interface ProfileOption {
  id: string;
  full_name: string;
}

const EMPTY_FORM = {
  id: null as string | null,
  department_code: "",
  department_name: "",
  description: "",
  parent_id: "",
  department_head: "",
};

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  async function load() {
    setLoading(true);
    setError(null);
    const [{ data: depts, error: deptErr }, { data: people, error: peopleErr }] = await Promise.all([
      listDepartmentsOrderedByDepartmentName(),
      listProfiles(),
    ]);
    if (deptErr || peopleErr) {
      setError((deptErr ?? peopleErr)?.message ?? "Failed to load departments");
      setLoading(false);
      return;
    }
    const list = (depts ?? []) as Department[];
    setDepartments(list);
    setProfiles((people ?? []) as ProfileOption[]);

    const counts: Record<string, number> = {};
    await Promise.all(
      list.map(async (d) => {
        const { count } = await countProfilesByDepartmentId(d.id);
        counts[d.id] = count ?? 0;
      }),
    );
    setStaffCounts(counts);
    setLoading(false);
  }

  useEffect(() => {
    // Fetch-on-mount, matching the fetch-on-mount pattern used throughout this codebase's
    // list pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(d: Department) {
    setForm({
      id: d.id,
      department_code: d.department_code,
      department_name: d.department_name,
      description: d.description ?? "",
      parent_id: d.parent_id ?? "",
      department_head: d.department_head ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.department_code.trim() || !form.department_name.trim()) {
      toast.error("Department code and name are required");
      return;
    }
    if (form.id && form.parent_id === form.id) {
      toast.error("A department cannot be its own parent");
      return;
    }
    setSaving(true);
    const payload = {
      department_code: form.department_code.trim(),
      department_name: form.department_name.trim(),
      description: form.description.trim() || null,
      parent_id: form.parent_id || null,
      department_head: form.department_head || null,
    };
    const { error: saveErr } = form.id
      ? await updateDepartmentById(payload, form.id)
      : await insertDepartments(payload);
    setSaving(false);
    if (saveErr) {
      toast.error(saveErr.message);
      return;
    }
    toast.success(form.id ? "Department updated" : "Department created");
    setDialogOpen(false);
    load();
  }

  const childCount = deleteTarget ? departments.filter((d) => d.parent_id === deleteTarget.id).length : 0;
  const staffInDept = deleteTarget ? staffCounts[deleteTarget.id] ?? 0 : 0;

  async function handleDelete() {
    if (!deleteTarget) return;
    if (childCount > 0) {
      toast.error(`Reassign or remove ${childCount} sub-department(s) before deleting this one.`);
      return;
    }
    setDeleting(true);
    const { error: delErr } = await deleteDepartmentById(deleteTarget.id);
    setDeleting(false);
    if (delErr) {
      toast.error(delErr.message);
      return;
    }
    toast.success("Department deleted");
    setDeleteTarget(null);
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Department
        </Button>
      </div>

      {departments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No departments yet</p>
          <p className="text-xs text-muted-foreground">Create your first department to organize staff and reporting.</p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Department
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Code</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Parent</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Head</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Staff</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{d.department_code}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {d.parent_id && <span className="text-muted-foreground">└</span>}
                      <div>
                        <p className="font-medium text-foreground">{d.department_name}</p>
                        {d.description && <p className="text-xs text-muted-foreground line-clamp-1">{d.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {d.parent_id ? deptById.get(d.parent_id)?.department_name ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {d.department_head ? profileById.get(d.department_head) ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      (staffCounts[d.id] ?? 0) > 0
                        ? "border-blue-200 bg-blue-500/10 text-blue-600"
                        : "border-border bg-muted text-muted-foreground",
                    )}>
                      {staffCounts[d.id] ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(d)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label={`Edit ${d.department_name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(d)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        aria-label={`Delete ${d.department_name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Department" : "New Department"}</DialogTitle>
            <DialogDescription>
              Departments organize staff and feed the Department field on user profiles.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="department_code">Code</Label>
                <Input
                  id="department_code"
                  value={form.department_code}
                  onChange={(e) => setForm({ ...form, department_code: e.target.value })}
                  placeholder="STR"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department_name">Name</Label>
                <Input
                  id="department_name"
                  value={form.department_name}
                  onChange={(e) => setForm({ ...form, department_name: e.target.value })}
                  placeholder="Structural"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="parent_id">Parent Department</Label>
                <select
                  id="parent_id"
                  value={form.parent_id}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-hidden focus:border-ring"
                >
                  <option value="">— None —</option>
                  {departments
                    .filter((d) => d.id !== form.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>{d.department_name}</option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department_head">Department Head</Label>
                <select
                  id="department_head"
                  value={form.department_head}
                  onChange={(e) => setForm({ ...form, department_head: e.target.value })}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-hidden focus:border-ring"
                >
                  <option value="">— Unassigned —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {form.id ? "Save Changes" : "Create Department"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — profiles.department_id is ON DELETE SET NULL, so staff are
          unassigned (not deleted) if this department is removed; the admin must see that
          before confirming, per the Phase 4 brief's warn-not-silently-orphan requirement. */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.department_name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {childCount > 0
                ? `This department has ${childCount} sub-department(s). Reassign or remove them first.`
                : staffInDept > 0
                  ? `${staffInDept} staff member(s) are currently assigned to this department. They will be unassigned (their profile remains intact) — this action cannot be undone.`
                  : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleDelete}
              disabled={deleting || childCount > 0}
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
