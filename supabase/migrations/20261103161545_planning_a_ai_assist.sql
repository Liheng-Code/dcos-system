-- doc 35 Phase A: four more advisory AI tools on the existing run / suggestion / decision path
-- (plan_act_ai_runs, plan_act_ai_suggestions, plan_act_ai_decide):
--   A1 explain_qaqc_findings    -> kind qaqc_explanation
--   A2 summarise_delays         -> kind delay_summary
--   A3 draft_report_commentary  -> kind report_draft (a planner edits it before it goes into a report)
--   A4 ask_schedule             -> kind schedule_answer
-- Additive: the check lists only gain values. Nothing here lets AI change programme data.

alter table public.plan_act_ai_runs drop constraint if exists plan_act_ai_runs_tool_check;
alter table public.plan_act_ai_runs add constraint plan_act_ai_runs_tool_check check (tool = any (array[
  'find_activity_master', 'suggest_quantity_mapping', 'suggest_productivity', 'detect_schedule_conflict', 'explain_generation',
  'suggest_recovery_plan', 'explain_qaqc_findings', 'summarise_delays', 'draft_report_commentary', 'ask_schedule']));

alter table public.plan_act_ai_suggestions drop constraint if exists plan_act_ai_suggestions_kind_check;
alter table public.plan_act_ai_suggestions add constraint plan_act_ai_suggestions_kind_check check (kind = any (array[
  'match_master', 'quantity_mapping', 'productivity', 'conflict', 'explanation', 'recovery',
  'qaqc_explanation', 'delay_summary', 'report_draft', 'schedule_answer']));
