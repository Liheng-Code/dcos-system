"use client";

// Review package › Follow-up records: what in this report belongs to another
// register, and the record raised for it. The approver raises an RFI from an
// issue, an inspection request from an inspection line, or an HSE incident
// from the safety section, completing what the report does not hold. Each
// record is linked back to the report. The toolbox talk of an approved report
// is recorded by the system.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listFollowUps, raiseFollowUp, type FollowUp, type FollowUpKind } from "@/lib/construction/daily-reporting/service";
import type { DrPayload } from "@/lib/construction/daily-reporting/types";
import { Field, Flag, inputClass, SectionCard, textareaClass } from "./dr-ui";

const KIND: Record<FollowUpKind, { label: string; href: string }> = {
  RFI: { label: "RFI", href: "/dashboard/design" },
  INSPECTION_REQUEST: { label: "Inspection request", href: "/dashboard/qaqc?sub=inspections" },
  HSE_INCIDENT: { label: "HSE incident", href: "/dashboard/hse/incidents" },
  TOOLBOX_TALK: { label: "Toolbox talk", href: "/dashboard/hse/toolbox-talks" },
};

const INCIDENT_TYPES: [string, string][] = [
  ["near_miss", "Near miss"],
  ["first_aid", "First aid"],
  ["medical_treatment", "Medical treatment"],
  ["lost_time", "Lost time"],
  ["property_damage", "Property damage"],
  ["environmental", "Environmental"],
  ["fatality", "Fatality"],
];

function Raised({ link }: { link: FollowUp }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Flag tone="good">{KIND[link.kind].label} raised</Flag>
      <Link href={KIND[link.kind].href} className="font-mono text-xs underline underline-offset-2">
        {link.reference}
      </Link>
    </span>
  );
}

type Open = { kind: FollowUpKind; lineId: string | null } | null;

export function DrFollowUps({
  reportId,
  payload,
  canRaise,
}: {
  reportId: string;
  payload: DrPayload;
  /** An approver looking at the current version. */
  canRaise: boolean;
}) {
  const [links, setLinks] = useState<FollowUp[] | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLinks(await listFollowUps(reportId));
    } catch {
      setLinks([]);
    }
  }, [reportId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount / report change
    void load();
  }, [load]);

  if (!links) return null;
  const issues = payload.issues ?? [];
  const inspections = payload.inspections ?? [];
  const incidentsReported = (payload.safety?.incident_count ?? 0) + (payload.safety?.near_miss_count ?? 0);
  const incidents = links.filter((l) => l.kind === "HSE_INCIDENT");
  const toolbox = links.find((l) => l.kind === "TOOLBOX_TALK");
  if (issues.length === 0 && inspections.length === 0 && incidentsReported === 0 && links.length === 0 && !canRaise) return null;

  const linkOf = (kind: FollowUpKind, lineId: string) => links.find((l) => l.kind === kind && l.line_id === lineId);
  const start = (kind: FollowUpKind, lineId: string | null, initial: Record<string, string>) => {
    setFields(initial);
    setOpen({ kind, lineId });
  };
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));
  const isOpen = (kind: FollowUpKind, lineId: string | null) => open?.kind === kind && open.lineId === lineId;

  const submit = async () => {
    if (!open) return;
    setSaving(true);
    try {
      const result = await raiseFollowUp(reportId, open.kind, open.lineId, fields);
      toast.success(`${KIND[open.kind].label} ${result.reference} raised.`);
      setOpen(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const actions = (label: string) => (
    <div className="flex gap-2">
      <Button size="sm" disabled={saving} onClick={submit}>
        {label}
      </Button>
      <Button variant="ghost" size="sm" disabled={saving} onClick={() => setOpen(null)}>
        Cancel
      </Button>
    </div>
  );

  return (
    <SectionCard title="Follow-up records">
      <p className="text-xs text-muted-foreground">
        Turn something in this report into a record in its own register. The record is linked to this report; the reporting unit is not
        notified.
      </p>

      {issues.length > 0 ? (
        <div className="mt-3 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issues</h4>
          {issues.map((i) => {
            const link = linkOf("RFI", i.line_id);
            return (
              <div key={i.line_id} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0">{i.description}</p>
                  {link ? (
                    <Raised link={link} />
                  ) : canRaise && !isOpen("RFI", i.line_id) ? (
                    <Button variant="outline" size="sm" onClick={() => start("RFI", i.line_id, { title: i.description.slice(0, 80), question: i.description, discipline: "" })}>
                      Raise RFI
                    </Button>
                  ) : null}
                </div>
                {isOpen("RFI", i.line_id) ? (
                  <div className="mt-2 space-y-2 rounded-md bg-muted/30 p-3">
                    <div className="grid gap-2 md:grid-cols-3">
                      <Field label="Title" className="md:col-span-2">
                        <input className={inputClass} maxLength={200} value={fields.title ?? ""} onChange={set("title")} />
                      </Field>
                      <Field label="Discipline">
                        <select className={inputClass} value={fields.discipline ?? ""} onChange={set("discipline")}>
                          <option value="">Choose…</option>
                          <option value="arc">Architecture</option>
                          <option value="str">Structure</option>
                          <option value="mep">MEP</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Question">
                      <textarea className={textareaClass} rows={3} value={fields.question ?? ""} onChange={set("question")} />
                    </Field>
                    <Field label="Answer needed by" className="max-w-xs">
                      <input type="date" className={inputClass} value={fields.due_date ?? ""} onChange={set("due_date")} />
                    </Field>
                    {actions("Raise RFI")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {inspections.length > 0 ? (
        <div className="mt-3 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspections asked for</h4>
          {inspections.map((q) => {
            const link = linkOf("INSPECTION_REQUEST", q.line_id);
            return (
              <div key={q.line_id} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0">
                    {q.reference || "Inspection"}
                    {q.status ? <span className="ml-2 text-xs text-muted-foreground">{q.status}</span> : null}
                  </p>
                  {link ? (
                    <Raised link={link} />
                  ) : canRaise && !isOpen("INSPECTION_REQUEST", q.line_id) ? (
                    <Button variant="outline" size="sm" onClick={() => start("INSPECTION_REQUEST", q.line_id, { location: q.reference ?? "" })}>
                      Create inspection request
                    </Button>
                  ) : null}
                </div>
                {isOpen("INSPECTION_REQUEST", q.line_id) ? (
                  <div className="mt-2 space-y-2 rounded-md bg-muted/30 p-3">
                    <div className="grid gap-2 md:grid-cols-3">
                      <Field label="Location" className="md:col-span-2">
                        <input className={inputClass} value={fields.location ?? ""} onChange={set("location")} />
                      </Field>
                      <Field label="Inspection date">
                        <input type="date" className={inputClass} value={fields.inspection_date ?? ""} onChange={set("inspection_date")} />
                      </Field>
                    </div>
                    <Field label="Notes">
                      <textarea className={textareaClass} rows={2} value={fields.notes ?? ""} onChange={set("notes")} />
                    </Field>
                    {actions("Create inspection request")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Safety</h4>
        <div className="rounded-md border border-border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p>
              Reported: {payload.safety?.incident_count ?? 0} incident(s), {payload.safety?.near_miss_count ?? 0} near miss(es) · {incidents.length} recorded in
              HSE
            </p>
            {canRaise && !isOpen("HSE_INCIDENT", null) ? (
              <Button variant="outline" size="sm" onClick={() => start("HSE_INCIDENT", null, { incident_type: "near_miss", severity: "minor", description: payload.safety?.observations ?? "" })}>
                Record HSE incident
              </Button>
            ) : null}
          </div>
          {incidents.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {incidents.map((l) => (
                <li key={l.id}>
                  <Raised link={l} />
                </li>
              ))}
            </ul>
          ) : null}
          {isOpen("HSE_INCIDENT", null) ? (
            <div className="mt-2 space-y-2 rounded-md bg-muted/30 p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Field label="Type">
                  <select className={inputClass} value={fields.incident_type ?? "near_miss"} onChange={set("incident_type")}>
                    {INCIDENT_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Severity">
                  <select className={inputClass} value={fields.severity ?? "minor"} onChange={set("severity")}>
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="serious">Serious</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <Field label="Location">
                  <input className={inputClass} value={fields.location ?? ""} onChange={set("location")} />
                </Field>
              </div>
              <Field label="What happened">
                <textarea className={textareaClass} rows={3} value={fields.description ?? ""} onChange={set("description")} />
              </Field>
              <Field label="Immediate action taken">
                <textarea className={textareaClass} rows={2} value={fields.immediate_action ?? ""} onChange={set("immediate_action")} />
              </Field>
              {actions("Record incident")}
            </div>
          ) : null}
        </div>
        {toolbox ? (
          <p className="text-sm">
            <Raised link={toolbox} /> <span className="text-xs text-muted-foreground">recorded automatically when the report was approved</span>
          </p>
        ) : payload.safety?.toolbox_talk_held ? (
          <p className="text-xs text-muted-foreground">The toolbox talk is added to the HSE register when the report is approved.</p>
        ) : null}
      </div>
    </SectionCard>
  );
}
