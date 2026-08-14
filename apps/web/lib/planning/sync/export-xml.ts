// Builds an MSPDI XML document from DCOS wbs_tasks for round-tripping back
// into Project Desktop. Server-side; output is hand-serialized (MSPDI is a
// stable, well-defined schema — no XML lib needed).

import type { DependencyType } from "./types";

export interface ExportTask {
  uid: string;
  id: number;
  name: string;
  outlineNumber: string;
  wbs: string;
  start?: string | null;
  finish?: string | null;
  durationHours?: number | null;
  percentComplete: number;
  summary: boolean;
  milestone: boolean;
  predecessors: { uid: string; type: DependencyType; lag: number }[];
}

export interface ExportDoc {
  projectName?: string | null;
  projectTitle?: string | null;
  tasks: ExportTask[];
}

const TYPE_TO_MSPDI: Record<DependencyType, number> = {
  FS: 1,
  SS: 3,
  FF: 0,
  SF: 2,
};

export function buildMspdXml(doc: ExportDoc): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<Project xmlns="http://schemas.microsoft.com/project">`,
    `  <SaveVersion>15</SaveVersion>`,
    `  <Name>${esc(doc.projectName || "")}</Name>`,
    `  <Title>${esc(doc.projectTitle || "")}</Title>`,
    `  <Tasks>`,
  ];

  for (const task of doc.tasks) {
    lines.push(`    <Task>`);
    lines.push(`      <UID>${esc(task.uid)}</UID>`);
    lines.push(`      <ID>${task.id}</ID>`);
    lines.push(`      <Name>${esc(task.name)}</Name>`);
    if (task.wbs) lines.push(`      <WBS>${esc(task.wbs)}</WBS>`);
    lines.push(`      <OutlineNumber>${esc(task.outlineNumber)}</OutlineNumber>`);
    lines.push(`      <OutlineLevel>3</OutlineLevel>`);
    lines.push(`      <Summary>${task.summary ? 1 : 0}</Summary>`);
    lines.push(`      <Milestone>${task.milestone ? 1 : 0}</Milestone>`);
    if (task.start) lines.push(`      <Start>${task.start}</Start>`);
    if (task.finish) lines.push(`      <Finish>${task.finish}</Finish>`);
    if (task.durationHours != null) {
      lines.push(`      <Duration>${hoursToIso(task.durationHours)}</Duration>`);
      lines.push(`      <DurationFormat>7</DurationFormat>`);
    }
    lines.push(`      <PercentComplete>${task.percentComplete}</PercentComplete>`);
    for (const pred of task.predecessors) {
      lines.push(`      <PredecessorLink>`);
      lines.push(`        <PredecessorUID>${esc(pred.uid)}</PredecessorUID>`);
      lines.push(`        <Type>${TYPE_TO_MSPDI[pred.type]}</Type>`);
      lines.push(`        <LinkLag>${pred.lag}</LinkLag>`);
      lines.push(`      </PredecessorLink>`);
    }
    lines.push(`    </Task>`);
  }

  lines.push(`  </Tasks>`);
  lines.push(`</Project>`);
  return lines.join("\n");
}

function hoursToIso(hours: number): string {
  const days = Math.floor(hours / 8);
  const rest = Math.round((hours - days * 8) * 100) / 100;
  return `PT${days}D${rest}H`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
