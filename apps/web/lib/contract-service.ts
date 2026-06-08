import { createClient } from "@/lib/supabase/client";
import type {
  ContractRegister, ContractEmployerInstruction, ContractualNotice,
  EntitlementRegister, ContractCorrespondence, TimeBarAlert,
} from "@/lib/contract-types";

// ── Contract Register ──────────────────────────────────────────────────────────

export async function getContracts(): Promise<ContractRegister[]> {
  const { data, error } = await createClient()
    .from("contract_register")
    .select("*, projects(project_name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractRegister[];
}

export async function getContract(id: string): Promise<ContractRegister> {
  const { data, error } = await createClient()
    .from("contract_register")
    .select("*, projects(project_name)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as ContractRegister;
}

export async function createContract(payload: Partial<ContractRegister>): Promise<ContractRegister> {
  const { data, error } = await createClient()
    .from("contract_register")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContractRegister;
}

export async function updateContract(id: string, payload: Partial<ContractRegister>): Promise<ContractRegister> {
  const { data, error } = await createClient()
    .from("contract_register")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContractRegister;
}

export async function deleteContract(id: string): Promise<void> {
  const { error } = await createClient().from("contract_register").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Employer Instructions ──────────────────────────────────────────────────────

export async function getEmployerInstructions(contractId?: string): Promise<ContractEmployerInstruction[]> {
  let q = createClient()
    .from("contract_employer_instructions")
    .select("*, contract_register(contract_no, title)")
    .order("instruction_date", { ascending: false });
  if (contractId) q = q.eq("contract_id", contractId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractEmployerInstruction[];
}

export async function getEmployerInstruction(id: string): Promise<ContractEmployerInstruction> {
  const { data, error } = await createClient()
    .from("contract_employer_instructions")
    .select("*, contract_register(contract_no, title)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as ContractEmployerInstruction;
}

export async function createEmployerInstruction(payload: Partial<ContractEmployerInstruction>): Promise<ContractEmployerInstruction> {
  const { data, error } = await createClient()
    .from("contract_employer_instructions")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContractEmployerInstruction;
}

export async function updateEmployerInstruction(id: string, payload: Partial<ContractEmployerInstruction>): Promise<ContractEmployerInstruction> {
  const { data, error } = await createClient()
    .from("contract_employer_instructions")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContractEmployerInstruction;
}

export async function deleteEmployerInstruction(id: string): Promise<void> {
  const { error } = await createClient().from("contract_employer_instructions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Contractual Notices ────────────────────────────────────────────────────────

export async function getNotices(contractId?: string): Promise<ContractualNotice[]> {
  let q = createClient()
    .from("contractual_notices")
    .select("*, contract_register(contract_no, title)")
    .order("deadline_date", { ascending: true });
  if (contractId) q = q.eq("contract_id", contractId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractualNotice[];
}

export async function getNotice(id: string): Promise<ContractualNotice> {
  const { data, error } = await createClient()
    .from("contractual_notices")
    .select("*, contract_register(contract_no, title)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as ContractualNotice;
}

export async function createNotice(payload: Partial<ContractualNotice>): Promise<ContractualNotice> {
  const { data, error } = await createClient()
    .from("contractual_notices")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContractualNotice;
}

export async function updateNotice(id: string, payload: Partial<ContractualNotice>): Promise<ContractualNotice> {
  const { data, error } = await createClient()
    .from("contractual_notices")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContractualNotice;
}

export async function deleteNotice(id: string): Promise<void> {
  const { error } = await createClient().from("contractual_notices").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Entitlement Register ───────────────────────────────────────────────────────

export async function getEntitlements(contractId?: string): Promise<EntitlementRegister[]> {
  let q = createClient()
    .from("entitlement_register")
    .select("*, contract_register(contract_no, title), contractual_notices(notice_no, title)")
    .order("created_at", { ascending: false });
  if (contractId) q = q.eq("contract_id", contractId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as EntitlementRegister[];
}

export async function getEntitlement(id: string): Promise<EntitlementRegister> {
  const { data, error } = await createClient()
    .from("entitlement_register")
    .select("*, contract_register(contract_no, title), contractual_notices(notice_no, title)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as EntitlementRegister;
}

export async function createEntitlement(payload: Partial<EntitlementRegister>): Promise<EntitlementRegister> {
  const { data, error } = await createClient()
    .from("entitlement_register")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EntitlementRegister;
}

export async function updateEntitlement(id: string, payload: Partial<EntitlementRegister>): Promise<EntitlementRegister> {
  const { data, error } = await createClient()
    .from("entitlement_register")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EntitlementRegister;
}

export async function deleteEntitlement(id: string): Promise<void> {
  const { error } = await createClient().from("entitlement_register").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Correspondence ─────────────────────────────────────────────────────────────

export async function getCorrespondence(contractId?: string): Promise<ContractCorrespondence[]> {
  let q = createClient()
    .from("contract_correspondence")
    .select("*, contract_register(contract_no, title)")
    .order("correspondence_date", { ascending: false });
  if (contractId) q = q.eq("contract_id", contractId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractCorrespondence[];
}

export async function getCorrespondenceById(id: string): Promise<ContractCorrespondence> {
  const { data, error } = await createClient()
    .from("contract_correspondence")
    .select("*, contract_register(contract_no, title)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as ContractCorrespondence;
}

export async function createCorrespondence(payload: Partial<ContractCorrespondence>): Promise<ContractCorrespondence> {
  const { data, error } = await createClient()
    .from("contract_correspondence")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContractCorrespondence;
}

export async function updateCorrespondence(id: string, payload: Partial<ContractCorrespondence>): Promise<ContractCorrespondence> {
  const { data, error } = await createClient()
    .from("contract_correspondence")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContractCorrespondence;
}

export async function deleteCorrespondence(id: string): Promise<void> {
  const { error } = await createClient().from("contract_correspondence").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Time Bar Alerts ────────────────────────────────────────────────────────────

export async function getTimeBarAlerts(): Promise<TimeBarAlert[]> {
  const { data, error } = await createClient()
    .from("time_bar_alerts")
    .select("*")
    .order("deadline_date");
  if (error) throw new Error(error.message);
  return (data ?? []) as TimeBarAlert[];
}

// ── Dashboard stats ────────────────────────────────────────────────────────────

export async function getContractStats(): Promise<{
  contracts: number; notices: number; overdue: number;
  activeContracts: number; totalValue: number;
}> {
  const supabase = createClient();
  const [c, n, o, a, v] = await Promise.all([
    supabase.from("contract_register").select("id", { count: "exact", head: true }),
    supabase.from("contractual_notices").select("id", { count: "exact", head: true }),
    supabase.from("contractual_notices").select("id", { count: "exact", head: true })
      .eq("status", "pending").lt("deadline_date", new Date().toISOString()),
    supabase.from("contract_register").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("contract_register").select("contract_value"),
  ]);
  const totalValue = (v.data ?? []).reduce((s, r) => s + Number(r.contract_value), 0);
  return {
    contracts: c.count ?? 0,
    notices: n.count ?? 0,
    overdue: o.count ?? 0,
    activeContracts: a.count ?? 0,
    totalValue,
  };
}
