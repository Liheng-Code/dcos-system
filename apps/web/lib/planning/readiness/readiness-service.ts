// Programme readiness (doc 35 U1): the facts (plan_programme_readiness) and the BOQ mapping summary, in parallel.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadReconciliation } from "../boq-mapping/boq-mapping-service";
import { programmeReadiness, type ReadinessFacts, type ReadinessStep } from "./programme-readiness";

export async function loadProgrammeReadiness(db: SupabaseClient, projectId: string): Promise<ReadinessStep[]> {
  const [facts, mapping] = await Promise.all([
    db.rpc("plan_programme_readiness", { p_project_id: projectId }),
    // the mapping step only needs the summary; without it the step shows as not started
    loadReconciliation(db, projectId).then((r) => r.summary).catch(() => null),
  ]);
  if (facts.error) throw new Error(facts.error.message);
  return programmeReadiness(facts.data as ReadinessFacts, mapping);
}
