# 07 – RBAC Matrix
**Module:** 04-20-01 Quantity Take-off
**Version:** 1.1 (as built, P0)

Permissions use the DCOS role matrix (`role_permissions`, module `qto`), checked in the UI with `useQtoPermissions().can()` and in the database with `has_permission()`. Admins (`is_admin`) pass every check, except that **no one, admin included, may approve a version they submitted.**

## Actions
| Action (module `qto`) | Field used | Gates |
|---|---|---|
| `qto_sessions` | view / can_create / edit / submit / delete | see sessions; create sessions and versions; start or resume work, acknowledge warnings; submit for review; cancel a version |
| `qto_workspace` | edit | add and edit items, measurements, calculations, factors and calibrations; run validation |
| `qto_register` | view | read items, measurements and calculations |
| `qto_approval` | approve | approve or request changes |
| `qto_publish` | approve | publish an approved version |
| `qto_transfer` | submit | transfer a publication to the tender BOQ |
| `qto_boq_mapping` | can_create | map items to tender BOQ lines before publication |
| `qto_export` | export | Excel / CSV export of a publication |
| `qto_rules` | view / configure | read rulesets; create drafts, approve, retire |
| `qto_drawings`, `qto_documents` | can_create / delete | drawing and document registers (unchanged from V1) |

`qto_sessions`, `qto_publish`, `qto_transfer` and `qto_rules` were added by `20261027131622` and derived from the V1 matrix:
- `qto_sessions` copies `qto_register`.
- `qto_publish` copies `qto_approval`.
- `qto_transfer.submit` copies `qto_boq_mapping.can_create`.
- `qto_rules.configure` is given to L1 and L2.

## Resulting matrix (seeded roles)
| Capability | QS | L3 PM | L2 GM | L1 MD | PO | L4–L6 | External | Admin |
|---|---|---|---|---|---|---|---|---|
| View sessions | ✓ | ✓ | ✓ | ✓ | ✓ | per seed | per seed | ✓ |
| Create session / version | ✓ | ✓ | ✓ | ✓ | ✓ | per seed | — | ✓ |
| Edit items, measure | ✓ | ✓ | ✓ | ✓ | ✓ | per seed | — | ✓ |
| Submit for review | ✓ | ✓ | ✓ | ✓ | ✓ | per seed | — | ✓ |
| Approve / request changes | — | ✓ | ✓ | ✓ | — | per seed | — | ✓ (not own) |
| Publish | — | ✓ | ✓ | ✓ | — | per seed | — | ✓ |
| Transfer to BOQ | — | ✓ | ✓ | ✓ | — | per seed | — | ✓ |
| Export | ✓ | ✓ | ✓ | ✓ | ✓ | per seed | per seed | ✓ |
| Configure rules | — | — | ✓ | ✓ | — | — | — | ✓ |
| Cancel a version | — | — | ✓ | ✓ | — | per seed | — | ✓ |
| Hard-delete items | — | — | — | — | — | — | — | ✓ |

"per seed" means the value follows `20260805000002_seed_qto_rbac.sql` for that role; query `role_permissions` for the exact flags.
The spec's "Senior QS" role does not exist in DCOS. Approval belongs to whoever holds `qto_approval.approve` (L1–L3 by default). Administration > Roles can grant it to a QS lead.

## Separation of duties
- The submitter of a version cannot approve it (`QTO_SELF_APPROVAL`, checked in the database).
- Submitted, approved and published versions are read-only to everyone through ordinary APIs (edit-guard trigger).
- Publications, reviews, calculation runs and transfers are append-only.
