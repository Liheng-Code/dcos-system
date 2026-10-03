-- projects.project_status defaulted to 'tender', which projects_project_status_check rejects
-- (allowed: draft, pending_approval, active, on_hold, completed, archived), so any insert that
-- omitted the status failed. New projects start as 'draft', as the create forms already send.
alter table public.projects alter column project_status set default 'draft';
