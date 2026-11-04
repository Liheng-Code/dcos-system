# DCOS — Daily Reporting Module
## 06 — UI / UX Design

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-UX-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |
| Route | `/dashboard/site/daily-reporting` |

---

## 1. Principles

1. **Built for a phone on site.** Controls are 40 px high; native selects and date pickers; one column on narrow screens.
2. **Select, don't type.** Activities come from the plan.
3. **Problems where they occur.** Each finding appears beside the section or line it concerns, and again on the review screen.
4. **Exception first for the approver.** Flagged reports lead the inbox; changes since the previous version are highlighted.
5. **Never hide what is unofficial.** The summary always states pending and missing units.
6. **One status label.** The user sees one label derived from the report's state fields.

## 2. Navigation

Construction → Site & Quality → **Daily Reporting**. The legacy screen remains as **Site Diary (legacy)**.

Tabs shown depend on the user:

| Tab | Shown to |
|---|---|
| My reports | Reporters of at least one unit (and users with no review rights) |
| Review (n) | Approvers |
| Daily summary | Approvers |
| Missing reports | Approvers |
| Setup | Daily Reporting admins of the project |

Deep links: `?report=<id>` opens a report; `?tab=summary&date=<date>` and `?tab=missing` open a tab. Notifications use these.

## 3. Status labels

| Label | Meaning | Colour |
|---|---|---|
| Awaiting PM | Submitted, not yet opened | Blue |
| In review | Opened by an approver | Blue |
| Information requested | Approver asked a question | Red |
| Returned — action required | Items returned for correction | Red |
| Approved | Approved, or approved with remark | Green |
| Amendment pending | An amendment awaits approval | Blue |
| Withdrawn | Withdrawn by the reporter | Grey |

Flags beside the label: No work · Late · Backdated · Imported · n flagged (approver only).

## 4. Screens

### 4.1 My reports

- Unit selector (only if more than one), report date, **Start report** / **Open DR-…** / **Replace No Work with a report**.
- Red panel listing reports that need the reporter's action.
- Table: report, date, status, submitted time (last 30 days).

### 4.2 Report form

- Header: unit, date, deadline; draft state ("Draft saved" / "Saved on device — not yet sent").
- **Work was done / No work today** toggle.
- Six steps, each a button so any step can be reopened.
- Activity card: plan dates and current progress; status, cumulative %, quantity, unit, crew, hours/OT; steps (if any); actual dates; remarks; **Add photo** (opens the camera on a phone); photo count; findings.
- Other sections are lists of lines with Add / Remove.
- Review step: totals, attachments, reason field (amendment, correction reply, or replacing No Work), and all findings. Errors disable Submit; warnings do not.
- Sticky Back / Next / Submit bar.
- Correction mode: red panel with the PM's message and items; locked sections are greyed and marked Locked.

### 4.3 Report view / review package

- Header with label, flags, version selector, and the actions available to this user (Correct returned items, Withdraw, Amend).
- Version line: submitted when, by whom, channel, reason, hash prefix.
- Checks panel (approver only).
- Sections read-only; lines changed since the previous version have an amber background.
- Activity card: reported quantity; verified quantity input and remark (approver, while reviewable); thumbnails.
- Delay card: classification selector (approver).
- **Return** tick box on each section or line; ticking it opens a reason field.
- History of decisions and requests.
- Decision panel: comment, Approve (becomes "Approve with remark" when a comment is typed), Request information, Return for correction.

### 4.4 Daily summary

- Date selector; revision selector when more than one exists.
- Coverage banner (amber if anything is pending or missing, green otherwise) with Live / Official marker.
- Four headline figures; table of units with their state; manpower by trade; day in numbers; verified against reported quantities (adjusted figures emphasised).
- Publish panel with narrative (approver, Live view only).

### 4.5 Missing reports

Table for the last 30 days: date, unit, status, escalation stage, Excuse (approver) or Open report.

### 4.6 Setup

Project switch · reporting units list · unit details (with WBS scope and evidence policy) · members · schedule · approvers.

## 5. Messages

| Situation | Message |
|---|---|
| Submitted with warnings | "DR-… submitted — n item(s) flagged for the PM" |
| Connection lost at submit | "Could not reach the server. Your report is saved on this device — try Submit again." |
| Report exists for the date | "DR-… already exists for this unit and date. Open it from the report list instead of submitting again." |
| Infected file | "An attached file was rejected by the virus scanner and has been removed. Attach a different file." |
| Decision on an old version | "DR-… has a newer version (v n); reload before deciding" |
| Own version | "You submitted this version, so you cannot approve it. Another approver must decide." |
| Nothing to publish | "nothing changed since revision n" |

## 6. Accessibility

Labels wrap their controls; icon-only buttons have `aria-label`; tabs use `role="tab"` and `aria-selected`; state is never shown by colour alone (each label has text); draft state is announced with `aria-live`.

## 7. Language

English in Phase 1A. User-facing labels for sections, statuses, delay causes and delay types are in `lib/construction/daily-reporting/status.ts`.

## 8. Not yet designed

Offline indicator and sync state (Phase 1B), Telegram Mini App entry (1C), AI findings panel and management overview (Phase 2).
