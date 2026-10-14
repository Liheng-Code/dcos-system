// What a project needs before it can be activated. Shared by the setup wizard's Activate step
// and the Overview's Setup health card, so both always agree.

export interface SetupFacts {
  category: string | null;
  clientId: string | null;
  projectManagerId: string | null;
  stakeholderCount: number;
  teamMemberCount: number;
  hasCalendar: boolean;
  hasNumbering: boolean;
  hasWbsSetup: boolean;
}

import type { SettingsSectionId } from "@/lib/project/projects/project-routes";

export interface SetupCheckItem {
  key: string;
  label: string;
  ok: boolean;
  /** Where to fix it: the Team tab, or a section of the Settings tab. */
  fix: { tab: "team" } | { tab: "settings"; section: SettingsSectionId };
}

export function setupChecklist(f: SetupFacts): SetupCheckItem[] {
  return [
    { key: "sector", label: "Sector selected", ok: !!f.category, fix: { tab: "settings", section: "general" } },
    { key: "client", label: "Client assigned", ok: !!f.clientId, fix: { tab: "settings", section: "contract" } },
    { key: "pm", label: "Project manager assigned", ok: !!f.projectManagerId, fix: { tab: "settings", section: "contract" } },
    { key: "stakeholders", label: "Stakeholders assigned", ok: f.stakeholderCount > 0, fix: { tab: "team" } },
    { key: "team", label: "Team members added", ok: f.teamMemberCount > 0, fix: { tab: "team" } },
    { key: "calendar", label: "Calendar configured", ok: f.hasCalendar, fix: { tab: "settings", section: "calendar" } },
    { key: "numbering", label: "Document numbering rule configured", ok: f.hasNumbering, fix: { tab: "settings", section: "numbering" } },
    { key: "wbs", label: "WBS setup selected", ok: f.hasWbsSetup, fix: { tab: "settings", section: "wbs" } },
  ];
}

/** The checklist as stored in project_activation_log.checklist. */
export function checklistRecord(items: SetupCheckItem[]): Record<string, boolean> {
  return Object.fromEntries(items.map((i) => [i.label, i.ok]));
}
