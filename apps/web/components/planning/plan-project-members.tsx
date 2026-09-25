"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { UserPlus, Loader2, Trash2, X, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ProjectMemberRow {
  user_id: string;
  role_code: string | null;
  added_by: string | null;
  created_at: string;
  profile?: { full_name: string; email: string } | null;
}

interface RoleOption {
  code: string;
  name: string;
  type: string;
  level: number | null;
}

export function PlanProjectMembers() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const { can, loaded: permsLoaded } = usePlanningPermissions();
  const canEdit = can("members", "edit");

  const [rows, setRows] = useState<ProjectMemberRow[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [profileOptions, setProfileOptions] = useState<
    { id: string; full_name: string; email: string }[]
  >([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("");

  async function load() {
    if (!selectedProjectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    // Independent queries — run concurrently instead of one after the other.
    const [{ data }, { data: roles }] = await Promise.all([
      supabase
        .from("project_members")
        .select("user_id, role_code, added_by, created_at, profiles(full_name, email)")
        .eq("project_id", selectedProjectId)
        .order("created_at", { ascending: true }),
      supabase.from("roles").select("code, name, type, level").order("level", { ascending: true }),
    ]);
    if (roles) setRoleOptions(roles as RoleOption[]);
    if (!data) { setLoading(false); return; }
    const mapped = (data as unknown as Array<{
      user_id: string; role_code: string | null; added_by: string | null; created_at: string;
      profiles: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
    }>).map((r) => ({
      user_id: r.user_id,
      role_code: r.role_code,
      added_by: r.added_by,
      created_at: r.created_at,
      profile: Array.isArray(r.profiles) ? r.profiles[0] ?? null : r.profiles,
    }));
    setRows(mapped);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  useEffect(() => {
    if (!showAdd) return;
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true })
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        setProfileOptions((data as { id: string; full_name: string; email: string }[]) ?? []);
      });
  }, [showAdd, supabase]);

  function openAdd() {
    setSelectedUserId("");
    setSelectedRole(roleOptions[0]?.code ?? "");
    setShowAdd(true);
  }

  async function handleAdd() {
    if (!selectedProjectId || !selectedUserId || !selectedRole) return;
    const { data: { user } } = await supabase.auth.getUser();
    setSaving(true);
    const { error } = await supabase.from("project_members").insert([
      { project_id: selectedProjectId, user_id: selectedUserId, role_code: selectedRole, added_by: user?.id ?? null },
    ]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Member added");
    setShowAdd(false);
    load();
  }

  async function handleRemove(member: ProjectMemberRow) {
    if (!selectedProjectId) return;
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", selectedProjectId)
      .eq("user_id", member.user_id);
    if (error) toast.error(error.message);
    else { toast.success("Member removed"); setRows(prev => prev.filter(r => r.user_id !== member.user_id)); }
  }

  const roleName = (code: string | null) => roleOptions.find(r => r.code === code)?.name ?? code ?? "—";
  const existingUserIds = new Set(rows.map(r => r.user_id));

  if (projectLoading || loading) return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Select a project to manage its planning team.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} member{rows.length === 1 ? "" : "s"} on the project — planning actions (view/edit/approve)
          are granted through these role assignments.
        </p>
        {canEdit && (
          <Button onClick={openAdd} size="sm">
            {showAdd ? <><X className="mr-1 h-4 w-4" />Cancel</> : <><UserPlus className="mr-1 h-4 w-4" />Add Member</>}
          </Button>
        )}
      </div>

      {showAdd && canEdit && (
        <Card><CardContent className="pt-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>Member *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
              >
                <option value="">Select profile…</option>
                {profileOptions
                  .filter(p => !existingUserIds.has(p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
              >
                {roleOptions.map(r => (
                  <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
                ))}
              </select>
            </div>
            <Button onClick={handleAdd} disabled={!selectedUserId || !selectedRole || saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <UserRound className="h-6 w-6" />
            No members added yet{canEdit ? " — add the project's planning team above" : ""}.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Member</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Added On</th>
                {canEdit && <th className="w-14 px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.user_id} className="border-b last:border-b-0">
                  <td className="px-4 py-2.5 font-medium">{m.profile?.full_name ?? "Unknown user"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.profile?.email ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="secondary">{roleName(m.role_code)}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(m)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent></Card>

      {!permsLoaded && <div className="hidden" />}
    </div>
  );
}