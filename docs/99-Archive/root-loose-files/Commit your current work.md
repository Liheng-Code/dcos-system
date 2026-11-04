###### **Step 1 — Commit your current work (required)**

Your branch feat/projects-redesign has 92 uncommitted files. That includes the new lane rules in CLAUDE.md, the agent updates and scripts/new-lane.ps1. A lane starts from the last commit, so without a commit your lanes won't have any of this.



In the main VS Code window, ask Claude: "Commit all current changes on feat/projects-redesign in logical commits." Or do it yourself with git add / git commit.



Check afterwards with git status, which should show nothing left.



##### **Step 2 — (Optional) Turn on Agent Teams**



You only need this for cross-module features later. Add this to .claude/settings.local.json:



"env": { "CLAUDE\_CODE\_EXPERIMENTAL\_AGENT\_TEAMS": "1" }



##### **Step 3 — Pick 3 tasks that don't overlap**

These three modules are closely linked:



Planning↔QS have the bridge (quantities drive durations).

QS→Procurement have "Raise PR from BOQ".

So give each lane a task inside its own module only, for example:



**Lane	Module key		Example topic		Stays inside**

A	planning		lookahead-filters	components/planning, lib/planning, app/dashboard/planning

B	qs			boq-alternates		components/qs, lib/qs, app/dashboard/tenders

C	procurement		rfq-comparison		components/procurement, lib/procurement, app/dashboard/procurement



A task that touches the bridge or BOQ→PR is cross-module. Save it for an Agent Team later, run from the main window.



##### **Step 4 — Create the 3 lanes**



In a PowerShell terminal at D:\\dcos-system:



.\\scripts\\new-lane.ps1 -Module planning    	-Topic lookahead-filters

.\\scripts\\new-lane.ps1 -Module qs          	-Topic boq-alternates

.\\scripts\\new-lane.ps1 -Module procurement 	-Topic rfq-comparison

Each run does the following:



Creates the branch, e.g. feat/qs-boq-alternates.

Creates the folder D:\\dcos-lanes\\qs-boq-alternates.

Copies .env.local and your Claude permissions into it.

Runs pnpm install, which takes a few minutes the first time.

Prints the lane's port: Planning gets 3001, QS 3002 and Procurement 3003.



##### **Step 5 — Open each lane in its own window**

For each lane, run the code "D:\\dcos-lanes\\..." line the script printed. You'll then have 4 VS Code windows: the main one plus 3 lanes. In each lane window's terminal:



cd apps\\web; pnpm dev -p 3001     # 3002 for QS, 3003 for Procurement

Keep Docker and the local Supabase running. All lanes use the same database.



##### **Step 6 — Paste the lane prompt in each window**

Open Claude in each lane window and paste the lane prompt from the guide page. Change the module and the domain agent for each lane:



**Lane**			**First line of the prompt**							**Domain agent (step 1 of the prompt)**

Planning		You are the lead for the Planning lane (module key: planning).			planning-manager

QS			You are the lead for the QS lane (module key: qs).				qs-manager (add commercial-qs if it involves IPC/retention/VO maths)

Procurement		You are the lead for the Procurement lane (module key: procurement).		procurement-manager



Then fill in the Task: line. The lead runs the agents in this order: domain agent → database-engineer → backend ∥ frontend → code-reviewer. After that come typecheck, lint, test and a commit.



##### **Step 7 — While they work**

Migrations: only one lane should be applying a migration at any moment. If two lanes both need schema changes, let one finish its migration step first. The add-only rule and timestamp names prevent most clashes.

Answering questions: each window may ask you something. Check the windows in turn.

Testing: open localhost:3001, 3002 and 3003 to try each feature.

Step 8 — Merge one lane at a time

In the main window, tell Claude:



"Merge feat/planning-lookahead-filters into feat/projects-redesign, then apply its Core requests."



Then go to the next lane's window and run "Rebase onto feat/projects-redesign and re-run typecheck, lint, test". Merge it the same way, then do the third lane.



Finally, remove each finished lane:





git worktree remove D:\\dcos-lanes\\planning-lookahead-filters

For the next round, run new-lane.ps1 again with new topics.













