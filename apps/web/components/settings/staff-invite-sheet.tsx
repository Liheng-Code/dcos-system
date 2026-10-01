"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { X, Loader2, Send } from "lucide-react";
import { listRolesOfCodeAndNameAndType } from "@/lib/settings/settings-queries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface DepartmentOption {
  id: string;
  department_name: string;
}

interface RoleOption {
  code: string;
  name: string;
  type: string;
}

interface StaffInviteSheetProps {
  departments: DepartmentOption[];
  onClose: () => void;
  onInvited: () => void;
}

// Mirrors LEGACY_ROLE_VALUES in apps/web/lib/admin-users/admin-users-schemas.ts exactly —
// the invite endpoint's Zod schema only accepts these 5 values (the legacy profiles.role
// check constraint), unlike staff-edit-sheet.tsx's direct-write ROLES list which also offers
// "department_manager" for existing records.
const LEGACY_ROLE_VALUES = ["admin", "project_manager", "contractor", "inspector", "viewer"] as const;

// USR-02 — no password field, no account-status choice: BR1.01/BR1.02. Every new account
// starts INVITED via an emailed activation link; Admin never sets or sees a password.
const inviteFormSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  department_id: z.string().optional(),
  position: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  role: z.enum(LEGACY_ROLE_VALUES).optional(),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

export function StaffInviteSheet({ departments, onClose, onInvited }: StaffInviteSheetProps) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { full_name: "", email: "", department_id: "", position: "", phone: "", role: undefined },
  });

  useEffect(() => {
    listRolesOfCodeAndNameAndType().then(({ data }) => {
      if (data) setRoles(data as RoleOption[]);
    });
  }, []);

  function toggleRole(code: string) {
    setAssignedRoles((prev) => (prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]));
  }

  async function onSubmit(values: InviteFormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: values.full_name,
          email: values.email,
          department_id: values.department_id || undefined,
          position: values.position || undefined,
          phone: values.phone || undefined,
          role: values.role || undefined,
          user_role_codes: assignedRoles.length > 0 ? assignedRoles : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Map known server-side field/existence errors back onto the form where possible.
        if (data?.code === "USR_EMAIL_EXISTS") {
          setError("email", { message: "A user with this email already exists." });
        } else {
          toast.error(typeof data?.error === "string" ? data.error : "Failed to send invitation");
        }
        setSubmitting(false);
        return;
      }
      toast.success(`Invitation sent to ${values.email}. ${values.full_name} will receive an email to activate their account.`);
      onInvited();
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="relative w-full max-w-lg bg-background border-l border-border shadow-lg overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Invite New User</h2>
            <p className="text-xs text-muted-foreground">Sends an email activation link — no password is set here.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {/* Employee Information */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee Information</legend>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" {...register("full_name")} aria-invalid={!!errors.full_name} />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="department_id">Department</Label>
                <select
                  id="department_id"
                  {...register("department_id")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.department_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="position">Position</Label>
                <Input id="position" {...register("position")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </fieldset>

          {/* Login Information */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Login Information</legend>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              <p className="text-xs text-muted-foreground">
                The user will receive an email with a link to set their own password and activate their account.
              </p>
            </div>
          </fieldset>

          {/* Access Control */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access Control</legend>
            <div className="space-y-1.5">
              <Label htmlFor="role">System Role</Label>
              <select
                id="role"
                {...register("role")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              >
                <option value="">—</option>
                {LEGACY_ROLE_VALUES.map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            {roles.length > 0 && (
              <div className="space-y-1.5">
                <Label>RBAC Role Assignments (optional)</Label>
                <div className="space-y-1">
                  {roles.map((role) => (
                    <label
                      key={role.code}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={assignedRoles.includes(role.code)}
                        onChange={() => toggleRole(role.code)}
                        className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{role.name}</p>
                        <p className="text-xs text-muted-foreground">{role.code} · {role.type.replace(/_/g, " ")}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </fieldset>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background px-5 py-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send Invitation
          </Button>
        </div>
      </form>
    </div>
  );
}
