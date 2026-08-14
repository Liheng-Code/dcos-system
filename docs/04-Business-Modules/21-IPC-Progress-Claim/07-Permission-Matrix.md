# 07 — Permission Matrix
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-PERM-001 | **Rev:** R0
**Source rule:** AUTO-GENERATED from RBAC config in CI. Notes hand-maintained.

---

| Action ▸ / Role ▾ | View | Create | Edit | Submit | Approve | Recall | Certify-Record | Finance | Export |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| QS Engineer | ● | ● | ● | ● | – | – | ● | – | ● |
| QS / Commercial Manager | ● | ● | ● | ● | ● (step 1) | ● | ● | – | ● |
| Project Manager | ● | – | – | – | ● (step 2) | ● | – | – | ● |
| Project Director | ● | – | – | – | – | – | – | – | ● |
| Accountant | ● | – | – | – | – | – | – | ● | ● |
| Company Admin | ● | – | – | – | – | – | – | – | ● |
| Client / Consultant (portal) | ● (submitted only) | – | – | – | – | – | – | – | – |
| Viewer | ● | – | – | – | – | – | – | – | – |

Notes (hand-maintained):
- "Certify-Record" = entering the client's certification into the system, not
  the act of certifying — the client decides on paper/portal; we record.
- Retention manual override = separate permission `retention.override`, granted
  only to Commercial Manager, always with comment (FS BR4).
- Client portal sees submitted package + certified summary only; never internal
  drafts, comments, or variance analysis.
