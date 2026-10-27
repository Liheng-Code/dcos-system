# Production SQL (run by hand)

One-off SQL scripts that someone runs **by hand in the Supabase SQL Editor on production**. They are not migrations,
they are not seeds, and nothing runs them automatically. `/dbpush` does not send them. Never add them to
`supabase/config.toml`.

Rules:
- Each change comes as a pair: a `DRY_RUN` file, which changes nothing and shows a report, and a `RUN` file, which
  saves the change. Always run the dry run first, and check its report table.
- Each file runs in one transaction: if anything fails, nothing is saved.
- The SQL Editor shows only the last result. Every file ends with a single report table.
- Records are found by code (for example the project code), never by a fixed id. Local and production ids differ.

## PRJ-2026-004-PC sample programme (run on production 2026-10-27)

Sample data for testing the BOQ-driven programme (doc 24) on the 7 Story Mix Use Building. Files run in this order:

| Files | What it does | Afterwards |
|---|---|---|
| `1_DRY_RUN` / `2_RUN_sample_prj_2026_004_pc_boq.sql` | Loads the sample contract BOQ (BOQ-002, 117 lines), BOQ items with hours per unit, activity links and the location map. Runs once only. | Planning › Generate from BOQ: Preview, then Commit |
| `3_DRY_RUN` / `4_RUN_pin_unlinked_starts_prj_2026_004_pc.sql` | Gives activities with no predecessor a "Start no earlier than" date: the baseline start, or the earliest baseline start on their floor. Stops the programme bunching at the project start. | WBS builder › Schedule (start 2026-11-01) |
| `5_DRY_RUN` / `6_RUN_align_new_activities_prj_2026_004_pc.sql` | Starts each new BOQ activity with its matching original activity on the same floor, matched by building element. | WBS builder › Schedule |
| `7_DRY_RUN` / `8_RUN_basement_sequence_prj_2026_004_pc.sql` | Basement sequence: bored piles first, then excavation support, dewatering and excavation, then pile caps, ground beams and B1 structure. Activities are linked rather than given dates. | WBS builder › Schedule (start 2026-11-01) |

The local source of the sample data is `supabase/seeds/sample_prj_2026_004_pc_boq.sql` (local database only).
