// The tabs of a post-contract project and the sections of a tender, as the second URL segment
// (/dashboard/projects/[code]/[tab]). Shared by the workspace views and the Ctrl+K palette.

import type { WorkstreamCode } from "@/lib/qs/tender-lifecycle";

export const POSTCONTRACT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Team" },
  { id: "contract", label: "Contract" },
  { id: "boq", label: "BOQ" },
  { id: "variations", label: "Variations" },
  { id: "claims", label: "Claims" },
  { id: "payments", label: "Payments" },
  // Cost and time on one curve: cost-loaded baseline vs earned, actual and certified (doc 33).
  { id: "scurve", label: "S-Curve" },
  // The bid snapshot taken at award and, for projects awarded in place, the read-only pre-contract record.
  { id: "tender", label: "Tender" },
  { id: "settings", label: "Settings" },
] as const;

export type PostcontractTabId = (typeof POSTCONTRACT_TABS)[number]["id"];

// Sections follow the master pre-contract flow (docs/04-Business-Modules/04-02-Project-Setup/
// 04-02-01-Pre Contract Project/PRE-CONTRACT Project Prompt.md), numbered as its flow diagram.
export type TenderSectionId =
  | "registration" | "management" | "go-no-go"
  | "documents" | "technical" | "qs" | "planning" | "procurement" | "commercial" | "risk" | "hse-qaqc"
  | "clarifications" | "compilation" | "approval" | "submission" | "outcome";

export interface TenderSectionDef {
  id: TenderSectionId;
  no: string;
  label: string;
  workstreams?: WorkstreamCode[];
}

export const TENDER_SECTION_GROUPS: { title: string; sections: TenderSectionDef[] }[] = [
  {
    title: "Setup",
    sections: [
      { id: "registration", no: "01", label: "Registration" },
      { id: "management", no: "02", label: "Tender Management" },
      { id: "go-no-go", no: "03", label: "Go / No-Go" },
    ],
  },
  {
    title: "Workstreams",
    sections: [
      { id: "documents", no: "04", label: "Tender Documents", workstreams: ["documents"] },
      { id: "technical", no: "05", label: "Technical Review", workstreams: ["technical_arc", "technical_str", "technical_mep", "technical_bim"] },
      { id: "qs", no: "06", label: "QS Tendering", workstreams: ["qs_tendering"] },
      { id: "planning", no: "07", label: "Tender Planning", workstreams: ["planning"] },
      { id: "procurement", no: "08", label: "Procurement", workstreams: ["procurement"] },
      { id: "commercial", no: "09", label: "Commercial", workstreams: ["commercial"] },
      { id: "risk", no: "10", label: "Risk & Opportunity", workstreams: ["risk"] },
      { id: "hse-qaqc", no: "11", label: "HSE / QAQC", workstreams: ["hse_qaqc"] },
    ],
  },
  {
    title: "Control",
    sections: [
      { id: "clarifications", no: "12", label: "Clarifications & Addenda", workstreams: ["clarifications"] },
      { id: "compilation", no: "13", label: "Tender Compilation", workstreams: ["compilation"] },
      { id: "approval", no: "14", label: "Bid Approval" },
      { id: "submission", no: "15", label: "Submission" },
      { id: "outcome", no: "16", label: "Tender Outcome" },
    ],
  },
];

export const TENDER_SECTIONS: TenderSectionDef[] = TENDER_SECTION_GROUPS.flatMap((g) => g.sections);

/** What a project can be opened at: its tabs (post-contract) or sections (tender), plus Team. */
export function projectDestinations(projectType: string): { id: string; label: string }[] {
  return projectType === "tender"
    ? [...TENDER_SECTIONS.map((s) => ({ id: s.id, label: s.label })), { id: "team", label: "Team" }]
    : POSTCONTRACT_TABS.map((t) => ({ id: t.id, label: t.label }));
}
