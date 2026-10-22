# <Module> (key: `<key>`)

> Mapped <yyyy-mm-dd> from code, migrations and docs. Code wins if it disagrees; fix this file.

## 1. Purpose and pages
- What the module is for, in one or two lines.
- Release status (from `lib/modules/release.ts` and `nav_item_settings`).
- Routes, grouped as in the nav, one line each.

## 2. Data model
- Tables it owns → purpose, key columns, status values → the migration that creates each.
- Triggers, RPCs/functions, views.
- RLS approach per table group (and where it's still `using (true)`).

## 3. Code map
- `lib/<key>/` services: file → responsibility.
- Main components.
- Public API (`PUBLIC_API.<key>` in `module-boundaries.mjs`): file → what it exports.

## 4. Invariants
Rules that must not be broken, each with where it's enforced (DB trigger, RPC, service, UI only).

## 5. Integration points
- What this module reads or writes elsewhere, and who imports it. Link the rows in `integration-map.md`.

## 6. Status and gaps
- Done / partial / stubbed. Tests that exist. Known bugs and security gaps. Docs that are out of date.
