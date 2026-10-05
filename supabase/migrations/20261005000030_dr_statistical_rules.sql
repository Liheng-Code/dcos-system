-- Module 10-01 Daily Reporting, Phase 2: statistical rules (design 10.2, 10.3).
--
-- Global defaults for the three rules that compare a report with the unit's
-- own approved history or with a configured range. They are deterministic
-- code in the rules engine; this file only adds their definitions.
--
--   PROGRESS_JUMP          production of the day above N x the rolling average
--   PRODUCTIVITY_ABNORMAL  output per worker outside a band around the usual
--   QTY_RANGE              quantity or daily progress outside a configured range
--
-- The first two stay off for a unit until it has min_history_days approved
-- working days. QTY_RANGE needs no history and does nothing until a project
-- (or the global row) is given a range.

insert into public.dr_rule_definitions (project_id, rule_code, point, severity, params, min_history_days) values
  (null, 'PROGRESS_JUMP',         'POST_SUBMIT', 'WARNING',
     '{"window_days": 10, "multiplier": 3, "min_samples": 3}', 10),
  (null, 'PRODUCTIVITY_ABNORMAL', 'POST_SUBMIT', 'WARNING',
     '{"window_days": 10, "low_ratio": 0.4, "high_ratio": 2.5, "min_samples": 3}', 10),
  (null, 'QTY_RANGE',             'POST_SUBMIT', 'WARNING',
     '{"by_uom": {}, "max_daily_progress_pct": null}', 0)
on conflict do nothing;
