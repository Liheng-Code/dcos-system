# DCOS — Daily Reporting Module
## 07 — RBAC Matrix

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-RBAC-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |

---

## 1. Permission model

```
May act on a report =
      Role permission     (construction / daily_reporting in role_permissions)
  AND Project access      (project member, or approver of the project)
  AND Unit membership     (for reporters: active member of that unit, inside its dates)
  AND WBS scope           (activities limited to the unit's scope nodes)
  AND Assignment          (for decisions: approver of the project; not the submitter)
```

Membership of a unit is what lets a person submit. A role alone never does. Group or chat membership grants nothing.

## 2. Seeded role permissions (`module = 'construction'`, `action = 'daily_reporting'`)

| Role | View | Create / submit | Approve / reject | Export | Configure | Scope |
|---|---|---|---|---|---|---|
| L0 Super Admin | ✓ | ✓ | ✓ | ✓ | ✓ | company |
| L1 Managing Director | ✓ | – | ✓ | ✓ | ✓ | company |
| L2 General Manager | ✓ | – | ✓ | ✓ | ✓ | company |
| L3 Project Manager | ✓ | ✓ | ✓ | ✓ | ✓ | project |
| L4 Department Manager | ✓ | ✓ | – | ✓ | – | project |
| L5 Senior Engineer | ✓ | ✓ | – | ✓ | – | project |
| L6 Staff | ✓ | ✓ | – | – | – | own |
| SS Site Supervisor | ✓ | ✓ | – | – | – | own |
| PE Planning Engineer | ✓ | – | – | ✓ | – | project |
| QS | ✓ | – | – | ✓ | – | project |
| QA | ✓ | – | – | – | – | project |
| HSE | ✓ | – | – | – | – | project |
| EXT-SUB Subcontractor | ✓ | ✓ | – | – | – | own |

Scope `own` = only the units the person is a member of. Other scopes = every unit of projects the person is a member of.

**What the database actually enforces.** The approve column is informational: authority to decide comes from being an approver of the project (see §3), not from the role. View scope and `configure` are enforced by the helpers in §3.

## 3. Capabilities and how they are decided

| Capability | Decided by | Rule |
|---|---|---|
| Submit, correct, withdraw, answer | `dr_assert_intake`, `dr_is_unit_member` | Active REPORTER of the unit, inside `valid_from`–`valid_to`; unit Active |
| Upload evidence | API | Active REPORTER of the unit |
| Read a unit's reports | `dr_has_project_access` | Member of the unit, or project-wide viewer |
| Read all reports of a project | `dr_can_view_project` | Approver; or project member with view permission and scope other than `own` |
| Read findings, audit, delay classification | `dr_can_view_project` / `dr_can_review` | Never the reporting unit |
| Decide, publish, excuse | `dr_can_review` | System admin; approver in its dates; or the project manager when no primary approver is set |
| Approve a version | `dr_decide_review` | As above **and** not the submitter of that version |
| Amend an approved report | `dr_submit_amendment` | Approver, or member of the unit |
| Unit, member, scope, schedule setup; project switch | `dr_can_admin` | System admin; the project manager; or project member with `configure` |
| Set approvers | RLS on `dr_project_approvers` | System admin only |
| Change global rule defaults | RLS | System admin only |
| Change project rule overrides | RLS | `dr_can_admin` |

## 4. Visibility by audience

| Item | Reporter (own unit) | Reporter (other unit) | Approver | Project-wide viewer | Outsider |
|---|---|---|---|---|---|
| Report, versions, lines, evidence | ✓ | – | ✓ | ✓ | – |
| Correction request and items | ✓ | – | ✓ | ✓ | – |
| Decision comment | Only "approved with remark" | – | ✓ | ✓ | – |
| Rule findings | – | – | ✓ | ✓ | – |
| Verified quantities | ✓ | – | ✓ | ✓ | – |
| Delay classification | – | – | ✓ | ✓ | – |
| Daily summary | – | – | ✓ | ✓ | – |
| Missing records | Own unit | – | ✓ | ✓ | – |
| Audit log | – | – | ✓ | – | – |

## 5. Segregation of duties

| Control | Enforcement |
|---|---|
| A submitter cannot approve their own version | `dr_decide_review` raises `DR_SOD` |
| A PM cannot appoint their own alternate | `dr_project_approvers` writable by system admin only |
| A reporter cannot join another unit | RLS on `dr_reporting_unit_members` |
| Nobody can write a report record outside the gateway | Privileges revoked; gateway functions executable by the service role only |
| Nobody can alter a submitted version | Immutability triggers |
| Only a Daily Reporting admin switches the project on or off | Trigger on `projects.dr_enabled` |

## 6. Tests covering this matrix

`supabase/tests/dr_daily_reporting.test.sql` sections 4, 5 and 10; `gateway.integration.test.ts` "applies row-level security". See 09-Test-Plan.

## 7. Release control

The Construction module is not in `lib/modules/release.ts`. The page is hidden until an administrator switches it on in Module Settings (a `nav_item_settings` row for `/dashboard/site/daily-reporting` and for `group:construction:site_quality`).
