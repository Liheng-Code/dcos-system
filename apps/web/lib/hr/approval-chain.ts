import type { SupabaseClient } from "@supabase/supabase-js"

// ── Shared Types ─────────────────────────────────────────────────────────────

export interface ChainApproverInfo {
  id: string | null
  full_name: string | null
  email: string | null
  roleLabel: string
}

export interface ApprovalChainResult {
  firstApprover: ChainApproverInfo | null
  finalApprover: ChainApproverInfo | null
  source: "manual" | "auto"
  isExcluded: boolean
  isFunctionalOnly: boolean
  myRoleLevel: string | null
}

export interface ProfileData {
  id: string
  full_name: string
  email: string | null
  report_to: string | null
}

export interface RoleData {
  code: string
  name: string | null
  level: number | null
  type: string | null
}

export const ROLE_NAMES: Record<string, string> = {
  L0: "Super Admin",
  L1: "Managing Director",
  L2: "General Manager",
  L3: "Project Manager",
  L4: "Department Manager",
  L5: "Senior Engineer",
  L6: "Staff",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getTopInternalRole(roles: RoleData[]) {
  return roles
    .filter((r) => r.type === "internal_level" && r.level !== null)
    .sort((a, b) => (a.level as number) - (b.level as number))[0] ?? null;
}

// ── Compute from pre-loaded data (bulk / admin use) ──────────────────────────

export function computeApprovalChainFromData(
  profile: ProfileData,
  personRoles: RoleData[],
  overrideA1: string | null,
  overrideA2: string | null,
  profileMap: Map<string, ProfileData>,
  roleHolderMap: Map<string, ProfileData>,
): ApprovalChainResult {
  const myRole = getTopInternalRole(personRoles);

  // L0: excluded
  if (myRole?.level === 0) {
    return {
      firstApprover: null,
      finalApprover: null,
      source: "auto",
      isExcluded: true,
      isFunctionalOnly: false,
      myRoleLevel: `L0 · ${myRole.name}`,
    };
  }

  const myRoleLevel = myRole ? `L${myRole.level} · ${myRole.name}` : null;

  // Manual overrides
  if (overrideA1 || overrideA2) {
    const a1Prof = overrideA1 ? profileMap.get(overrideA1) ?? null : null;
    let a2Prof = overrideA2 ? profileMap.get(overrideA2) ?? null : null;

    if (!a2Prof) {
      const hrHolder = roleHolderMap.get("HR_Manager") ?? null;
      a2Prof = hrHolder;
    }

    return {
      firstApprover: a1Prof
        ? { id: a1Prof.id, full_name: a1Prof.full_name, email: a1Prof.email, roleLabel: "Manual Assignment" }
        : null,
      finalApprover: a2Prof
        ? { id: a2Prof.id, full_name: a2Prof.full_name, email: a2Prof.email, roleLabel: "Manual Assignment" }
        : null,
      source: "manual",
      isExcluded: false,
      isFunctionalOnly: !myRole,
      myRoleLevel,
    };
  }

  // Auto (role hierarchy) path
  if (!myRole) {
    const hrHolder = roleHolderMap.get("HR_Manager") ?? null;
    return {
      firstApprover: null,
      finalApprover: hrHolder
        ? { id: hrHolder.id, full_name: hrHolder.full_name, email: hrHolder.email, roleLabel: "HR Manager" }
        : { id: null, full_name: null, email: null, roleLabel: "HR Manager" },
      source: "auto",
      isExcluded: false,
      isFunctionalOnly: true,
      myRoleLevel: null,
    };
  }

  const myLevel = myRole.level as number;

  let firstApprover: ChainApproverInfo | null = null;

  if (myLevel === 6 && profile.report_to) {
    const sup = profileMap.get(profile.report_to) ?? null;
    firstApprover = sup
      ? { id: sup.id, full_name: sup.full_name, email: sup.email, roleLabel: "Direct Supervisor" }
      : { id: null, full_name: null, email: null, roleLabel: "Direct Supervisor" };
  } else {
    const code = `L${myLevel - 1}`;
    const holder = roleHolderMap.get(code) ?? null;
    firstApprover = holder
      ? { id: holder.id, full_name: holder.full_name, email: holder.email, roleLabel: `${code} · ${ROLE_NAMES[code] ?? code}` }
      : { id: null, full_name: null, email: null, roleLabel: `${code} · ${ROLE_NAMES[code] ?? code}` };
  }

  const hrHolder = roleHolderMap.get("HR_Manager") ?? null;
  const finalApprover: ChainApproverInfo = hrHolder
    ? { id: hrHolder.id, full_name: hrHolder.full_name, email: hrHolder.email, roleLabel: "HR Manager" }
    : { id: null, full_name: null, email: null, roleLabel: "HR Manager" };

  return {
    firstApprover,
    finalApprover,
    source: "auto",
    isExcluded: false,
    isFunctionalOnly: false,
    myRoleLevel,
  };
}

// ── Resolve from database (individual use) ───────────────────────────────────

export async function resolveApprovalChain(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<ApprovalChainResult> {
  const [profileRes, rolesRes, overridesRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, report_to").eq("id", employeeId).single(),
    supabase.from("user_roles")
      .select("role_code, roles(code, name, level, type)")
      .eq("user_id", employeeId),
    supabase.from("leave_approver_config")
      .select("approver_level, approver_id")
      .eq("config_type", "personal")
      .eq("employee_id", employeeId)
      .eq("is_active", true),
  ] as const);

  if (!profileRes.data) {
    throw new Error("Profile not found");
  }

  const profile = profileRes.data as ProfileData;
  const allRoles = (rolesRes.data ?? []) as any[];
  const overrides = (overridesRes.data ?? []) as { approver_level: number; approver_id: string }[];

  const overrideA1 = overrides.find((o) => o.approver_level === 1)?.approver_id ?? null;
  const overrideA2 = overrides.find((o) => o.approver_level === 2)?.approver_id ?? null;

  const mappedRoles: RoleData[] = allRoles
    .filter((r: any) => r.roles)
    .map((r: any) => ({
      code: r.role_code as string,
      name: r.roles.name as string | null,
      level: r.roles.level as number | null,
      type: r.roles.type as string | null,
    }));

  const myRole = getTopInternalRole(mappedRoles);

  // L0: excluded
  if (myRole?.level === 0) {
    return {
      firstApprover: null,
      finalApprover: null,
      source: "auto",
      isExcluded: true,
      isFunctionalOnly: false,
      myRoleLevel: `L0 · ${myRole.name}`,
    };
  }

  const myRoleLevel = myRole ? `L${myRole.level} · ${myRole.name}` : null;

  // Manual overrides
  if (overrideA1 || overrideA2) {
    const approverIds = [overrideA1, overrideA2].filter(Boolean) as string[];
    const { data: approvers } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", approverIds.length > 0 ? approverIds : ["none"]);

    const approverMap = new Map((approvers || []).map((a) => [a.id, a]));

    let a1Prof = overrideA1 ? approverMap.get(overrideA1) ?? null : null;
    let a2Prof = overrideA2 ? approverMap.get(overrideA2) ?? null : null;

    if (!a2Prof) {
      const { data: hrData } = await supabase
        .from("user_roles")
        .select("profiles!inner(id, full_name, email)")
        .eq("role_code", "HR_Manager")
        .limit(1)
        .maybeSingle();
      const hrp = (hrData as any)?.profiles as { id: string; full_name: string; email: string } | null;
      a2Prof = hrp ?? null;
    }

    return {
      firstApprover: a1Prof
        ? { id: a1Prof.id, full_name: a1Prof.full_name, email: a1Prof.email, roleLabel: "Manual Assignment" }
        : null,
      finalApprover: a2Prof
        ? { id: a2Prof.id, full_name: a2Prof.full_name, email: a2Prof.email, roleLabel: "Manual Assignment" }
        : null,
      source: "manual",
      isExcluded: false,
      isFunctionalOnly: !myRole,
      myRoleLevel,
    };
  }

  // Auto (role hierarchy) path
  if (!myRole) {
    const { data: hrData } = await supabase
      .from("user_roles")
      .select("profiles!inner(id, full_name, email)")
      .eq("role_code", "HR_Manager")
      .limit(1)
      .maybeSingle();
    const hrp = (hrData as any)?.profiles as { id: string; full_name: string; email: string } | null;

    return {
      firstApprover: null,
      finalApprover: hrp
        ? { id: hrp.id, full_name: hrp.full_name, email: hrp.email, roleLabel: "HR Manager" }
        : { id: null, full_name: null, email: null, roleLabel: "HR Manager" },
      source: "auto",
      isExcluded: false,
      isFunctionalOnly: true,
      myRoleLevel: null,
    };
  }

  // First approver from role hierarchy
  const myLevel = myRole.level as number;
  let firstApprover: ChainApproverInfo | null = null;

  if (myLevel === 6 && profile.report_to) {
    const { data: sup } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", profile.report_to)
      .single();

    firstApprover = sup
      ? { id: sup.id, full_name: sup.full_name, email: sup.email, roleLabel: "Direct Supervisor" }
      : { id: null, full_name: null, email: null, roleLabel: "Direct Supervisor" };
  } else {
    const firstCode = `L${myLevel - 1}`;
    const { data: firstData } = await supabase
      .from("user_roles")
      .select("profiles!inner(id, full_name, email)")
      .eq("role_code", firstCode)
      .limit(1)
      .maybeSingle();

    const fp = (firstData as any)?.profiles as { id: string; full_name: string; email: string } | null;
    firstApprover = fp
      ? { id: fp.id, full_name: fp.full_name, email: fp.email, roleLabel: `${firstCode} · ${ROLE_NAMES[firstCode] ?? firstCode}` }
      : { id: null, full_name: null, email: null, roleLabel: `${firstCode} · ${ROLE_NAMES[firstCode] ?? firstCode}` };
  }

  // HR Manager as final approver
  const { data: hrData } = await supabase
    .from("user_roles")
    .select("profiles!inner(id, full_name, email)")
    .eq("role_code", "HR_Manager")
    .limit(1)
    .maybeSingle();

  const hrp = (hrData as any)?.profiles as { id: string; full_name: string; email: string } | null;
  const finalApprover: ChainApproverInfo = hrp
    ? { id: hrp.id, full_name: hrp.full_name, email: hrp.email, roleLabel: "HR Manager" }
    : { id: null, full_name: null, email: null, roleLabel: "HR Manager" };

  return {
    firstApprover,
    finalApprover,
    source: "auto",
    isExcluded: false,
    isFunctionalOnly: false,
    myRoleLevel,
  };
}
