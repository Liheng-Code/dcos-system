# 12 — Training Guide
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/12-Training-Guide.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24

---

## Purpose and Audience

This guide is for everyone who touches the DCOS account lifecycle: System Administrators managing
staff accounts, and every staff member managing their own login. It is structured by role — read
only the section that applies to you.

**Roles covered:**
- System Administrator (full module — create, activate-support, lock/suspend/disable, force-reset,
  dashboards)
- Staff member (self-service — activate, change password, forgot password)

---

## Section 1: System Administrator Quick Reference

### 1.1 Inviting a New Staff Member

1. Go to Administration → User Management.
2. Click "New User."
3. Fill in their name, employee ID, department, position, and email. Select their role.
4. Click "Send Invitation."

**You never set a password here.** The system emails the new staff member an activation link;
they set their own password. If you're asked "what's their initial password?" — there isn't one.
They create it themselves the first time they log in.

**What happens next:** the account shows as "Invited" in the User Management list until they
activate it.

### 1.2 Locking, Unlocking, Suspending, or Disabling an Account

1. Go to Administration → User Management, find the user, click their row.
2. Open the Security section.
3. Choose the action:

| Action | Use when | Effect |
|---|---|---|
| Lock | Security concern — you want to freeze the account without deciding on suspension/termination yet | Immediately signs the user out; they cannot log in until you unlock it |
| Unlock | Reversing a Lock | Restores access |
| Suspend | Extended leave, investigation, contract expiry | Immediately signs the user out; reversible at any time |
| Disable | Termination, resignation, retirement — the person is no longer with the organisation | Immediately signs the user out; their historical records (documents, tasks, approvals they created) are preserved, never deleted |

4. Confirm the action in the dialog that appears.

**Important:** if HR runs a termination, resignation, retirement, or extended-leave action in the
Employee Master record, the account is disabled/suspended **automatically** — you do not need to
separately visit the Security section for those cases. Use the Security section for a purely
security-driven action (e.g., locking someone out while you investigate something), not for
routine employment changes that HR already handles.

### 1.3 Force Password Reset (Staff Member Locked Out)

If a staff member calls you saying they can't log in and can't complete "Forgot password"
themselves:

1. Go to their record → Security section.
2. Click "Force Password Reset."
3. Confirm.

**You will never see or set their new password** — a reset link is emailed to them, and they set
it themselves, same as any self-service reset. If they say their email is also inaccessible, that
is outside this module's scope — resolve their email access first through normal IT channels.

### 1.4 Viewing the Security Dashboard

Administration → Security shows organisation-wide counts (Active, Invited, Locked, Suspended,
Disabled) and a feed of recent account activity. Click any count tile to jump to the filtered User
Management list. This page is read-only — you cannot take any lock/suspend/disable/reset action
from here; those live on the individual user's Security section (§1.2/§1.3).

### 1.5 Viewing the Audit Log

Administration → Audit Logs shows the full, permanent history of every account action — who did
what, when, to whom. This log can never be edited or deleted, by anyone, including you. Use it to
investigate "who changed this" questions or to satisfy a compliance review.

### 1.6 Common Admin Mistakes to Avoid

| Mistake | Consequence | How to prevent |
|---|---|---|
| Trying to set a password when creating a user | There is no password field — you cannot make this mistake in the UI, but if asked to "just tell me the password," redirect to: "They'll set it themselves via the activation email." | Explain the activation-link flow up front when onboarding new hires |
| Assuming Unlock restores an HR-terminated account | It does not — an account disabled by HR termination stays `DISABLED` until HR reverses the employment action (which then automatically restores access) or you separately reactivate it | Check whether the account's disable reason was HR-driven or Admin-driven before acting |
| Expecting a suspended/disabled account to be recoverable via password reset | Password reset never bypasses a suspend/disable/lock — the account still cannot log in afterward even with a valid new password | Use the Security section's Unlock/reactivate action, not a password reset, to restore access |
| Assuming a locked-out user's data is deleted after Disable | Nothing is ever deleted — all of their historical records remain fully intact | Reassure the user/team; disabling is reversible and non-destructive |

---

## Section 2: Staff Member Quick Reference

### 2.1 Activating Your New Account

1. Check your email for "Your DCOS account has been created."
2. Click "Activate Account."
3. Choose your own password (at least 12 characters, with an uppercase letter, a lowercase
   letter, a number, and a special character).
4. Confirm your password and submit.

You're now active and can log in normally. Your System Administrator never knows or sees this
password.

**If the link doesn't work** (expired or already used): use "Forgot password?" on the login page
with the same email — the system recognises you haven't activated yet and treats it the same way.

### 2.2 Changing Your Password

1. Go to your profile → Security.
2. Click "Change Password."
3. Enter your current password, then your new password twice.
4. Submit.

You'll be signed out of any other device you were logged in on — only your current session stays
active. This is normal and is a security measure, not an error.

### 2.3 Forgot Your Password

1. On the login page, click "Forgot password?"
2. Enter your email and submit.
3. You'll always see the same message: "If an account exists for this email, a reset link has been
   sent." This is intentional — it's the same message whether or not you typed your email
   correctly, for security reasons. Check your inbox (and spam folder) before assuming something
   is wrong.
4. Click the link in the email, set a new password, and log in.

### 2.4 What You Cannot Do

- You cannot see or change your own `account_status`, role, department, or email — these are
  managed by your System Administrator. If any of these need to change, contact them.
- You cannot change another user's password, ever — not even to help a colleague.
- You cannot create new user accounts — only a System Administrator can invite new staff.

### 2.5 Common Situations

**"My account says Suspended / Disabled and I can't log in."**
Contact your System Administrator or HR. A password reset will not fix this — the account itself
needs to be restored by an Admin action.

**"I reset my password but I still can't log in."**
Your account may be Locked, Suspended, or Disabled for a separate reason unrelated to your
password. Contact your System Administrator.

**"I haven't logged in for a while and now I can't."**
DCOS automatically disables accounts that have been inactive for more than 90 days, as a security
measure. Contact your System Administrator to have your account reactivated — this is expected
behaviour, not an error.

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| `account_status` | Your login/access state — `INVITED`, `ACTIVE`, `LOCKED`, `SUSPENDED`, or `DISABLED`. Controlled by System Admin. |
| `status` (HR employment status) | Your employment lifecycle stage in the Employee Master record (e.g., `active`, `probation`, `terminated`). Controlled by HR. Different from `account_status`, though certain HR actions automatically update your `account_status` too. |
| Activation | Setting your password for the first time, via the emailed activation link, to move from `INVITED` to `ACTIVE`. |
| Force Password Reset | An Admin-triggered action that sends you a reset link. The Admin never sets or sees your password. |
| Lock | An Admin security action that immediately blocks login until an Admin unlocks it. Distinct from HR-driven suspension. |
| Session revocation | Signing a user out of all (or all other) active sessions/devices immediately. |
| Auto-disable (90-day) | An automatic, system-driven action (no human actor) that disables an account after 90 days without a login. |

## Appendix B: Who to Contact

| Issue | Contact |
|---|---|
| Cannot log in at all | System Administrator |
| Account shows Suspended/Disabled/Locked | System Administrator |
| Forgot password and the reset email never arrives | System Administrator (check spam first) |
| New employee has not received their activation email | System Administrator |
| Need a role, department, or email change | System Administrator or HR |
| Question about why an employment status changed | HR |
