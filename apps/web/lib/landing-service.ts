import { createClient } from "@/lib/supabase/client";

export interface LandingStats {
  projectCount: number;
  totalContractValue: number;
}

export async function getLandingStats(): Promise<LandingStats | null> {
  const { data, error } = await createClient().rpc("get_landing_stats").single();
  if (error || !data) return null;
  const row = data as { project_count: number; total_contract_value: number };
  return {
    projectCount: row.project_count,
    totalContractValue: Number(row.total_contract_value),
  };
}
