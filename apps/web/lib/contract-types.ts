export interface ContractRegister {
  id: string; project_id: string; contract_no: string;
  contract_type: "head_contract" | "subcontract" | "consultant" | "supplier" | "other";
  title: string; party_name: string; party_contact: string | null;
  contract_value: number; currency: string;
  start_date: string | null; end_date: string | null;
  status: "draft" | "active" | "completed" | "terminated" | "expired";
  signed_date: string | null; termination_date: string | null;
  governing_law: string | null; dispute_resolution: string | null;
  notes: string | null; attachment_url: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  projects?: { project_name: string } | null;
}

export interface ContractEmployerInstruction {
  id: string; contract_id: string; instruction_no: string;
  title: string; description: string; instruction_date: string;
  response_date: string | null;
  type: "variation" | "direction" | "clarification" | "approval" | "rejection" | "information";
  time_extension_days: number; cost_impact: number;
  status: "received" | "acknowledged" | "in_progress" | "complied" | "closed" | "disputed";
  assigned_to: string | null; notes: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  contract_register?: { contract_no: string; title: string } | null;
}

export interface ContractualNotice {
  id: string; contract_id: string; notice_no: string;
  notice_type: "notice_of_claim" | "notice_of_delay" | "notice_of_additional_cost"
    | "force_majeure" | "termination" | "default" | "variation_claim" | "extension_of_time";
  title: string; description: string;
  trigger_event: string | null; contract_clause: string | null;
  days_from_event: number | null; deadline_date: string;
  served_date: string | null; served_to: string | null;
  response_date: string | null; response_summary: string | null;
  status: "pending" | "served" | "acknowledged" | "accepted" | "rejected" | "time_barred" | "closed";
  is_time_barred: boolean;
  linked_to: string | null; linked_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  contract_register?: { contract_no: string; title: string } | null;
}

export interface EntitlementRegister {
  id: string; contract_id: string; entitlement_no: string;
  title: string; description: string;
  category: "time" | "cost" | "both";
  trigger_event: string | null; contract_clause: string | null;
  estimated_time_days: number; estimated_cost: number;
  approved_time_days: number; approved_cost: number;
  status: "identified" | "assessed" | "submitted" | "approved" | "rejected"
    | "partially_approved" | "closed";
  notice_id: string | null; variation_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  contract_register?: { contract_no: string; title: string } | null;
  contractual_notices?: { notice_no: string; title: string } | null;
}

export interface ContractCorrespondence {
  id: string; contract_id: string; correspondence_no: string;
  direction: "incoming" | "outgoing";
  subject: string; body: string | null;
  correspondence_date: string;
  from_party: string; to_party: string;
  category: "formal_letter" | "email" | "minutes_of_meeting" | "site_instruction" | "other";
  attachment_url: string | null;
  linked_to: string | null; linked_id: string | null;
  created_by: string | null; created_at: string;
  contract_register?: { contract_no: string; title: string } | null;
}

export interface TimeBarAlert {
  id: string; notice_no: string; title: string;
  contract_clause: string | null; deadline_date: string;
  days_from_event: number | null; trigger_event: string | null;
  status: string; contract_no: string; contract_title: string;
  project_id: string; project_name: string;
  alert_level: "overdue" | "approaching" | "ok";
  as_of_date: string;
}
