// A row of public.projects as the Projects module reads it.
export interface Project {
  id: string;
  project_code: string;
  project_name: string;
  project_type: string;
  client_id: string | null;
  consultant_id?: string | null;
  contract_type: string | null;
  contract_number: string | null;
  contract_value: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  project_status: string;
  project_manager_id: string | null;
  project_director_id: string | null;
  engineering_manager_id: string | null;
  planning_manager_id: string | null;
  description: string | null;
  short_name: string | null;
  category: string | null;
  building_type: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  time_zone: string | null;
  dlp_period: string | null;
  retention: number | null;
  advance_payment: number | null;
  duration: string | null;
  source_tender_project_id: string | null;
  created_at: string;
  updated_at: string;
}
