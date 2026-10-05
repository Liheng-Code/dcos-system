// Module 10-01 Daily Reporting — measurement support for the subcontractor
// payment certificate (design §6, D15): what a subcontract's reporting units
// reported and what the approver verified over a period, for the QS to read
// next to the certificate.
//
// Read-only. A reported quantity is the reporter's statement and a verified
// one is the approver's site check; neither is a certified quantity. Nothing
// here writes to the payment certificate.

import { createClient } from "@/lib/supabase/client";

export interface MeasurementRow {
  unit_id: string;
  unit_code: string;
  task_id: string | null;
  task_code: string | null;
  activity: string;
  wbs_node_id: string | null;
  wbs_code: string | null;
  wbs_name: string | null;
  uom: string | null;
  /** Approved report days on which the activity was reported. */
  days: number;
  first_date: string;
  last_date: string;
  reported_qty: number | null;
  /** The approver's figure where one was given, otherwise the reported one. */
  verified_qty: number | null;
  /** Lines where the approver changed the quantity. */
  adjusted_lines: number;
  progress_from: number | null;
  progress_to: number | null;
}

export interface SubcontractMeasurement {
  units: { unit_id: string; unit_code: string; display_name: string }[];
  coverage: { approved: number; pending: number; no_work: number };
  rows: MeasurementRow[];
}

export async function getSubcontractMeasurement(subcontractId: string, from: string, to: string): Promise<SubcontractMeasurement> {
  const { data, error } = await createClient().rpc("dr_subcontract_measurement", {
    p_subcontract_id: subcontractId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);
  const m = (data as SubcontractMeasurement | null) ?? { units: [], coverage: { approved: 0, pending: 0, no_work: 0 }, rows: [] };
  return {
    ...m,
    rows: (m.rows ?? []).map((r) => ({
      ...r,
      reported_qty: r.reported_qty === null ? null : Number(r.reported_qty),
      verified_qty: r.verified_qty === null ? null : Number(r.verified_qty),
      progress_from: r.progress_from === null ? null : Number(r.progress_from),
      progress_to: r.progress_to === null ? null : Number(r.progress_to),
    })),
  };
}

export interface ContractItemRef {
  id: string;
  item_code: string;
  description: string | null;
  unit: string;
  quantity: number;
  wbs_node_id: string | null;
}

const sameUnit = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Contract items that a measured activity may belong to: same WBS node. An
 * item in the same unit of measure comes first. This is a pointer for the
 * reader, not an allocation: an activity and a contract item are different
 * things, and the QS decides what counts.
 */
export function contractItemsFor(row: Pick<MeasurementRow, "wbs_node_id" | "uom">, items: ContractItemRef[]): ContractItemRef[] {
  if (!row.wbs_node_id) return [];
  return items
    .filter((i) => i.wbs_node_id === row.wbs_node_id)
    .sort((a, b) => Number(sameUnit(b.unit, row.uom)) - Number(sameUnit(a.unit, row.uom)) || a.item_code.localeCompare(b.item_code));
}

const num = (n: number | null) => (n === null ? "" : String(Math.round(n * 10000) / 10000));

/** The table as CSV rows, header first. */
export function measurementCsv(m: SubcontractMeasurement, items: ContractItemRef[]): string[][] {
  return [
    ["Unit", "WBS", "Activity code", "Activity", "UoM", "Days reported", "First day", "Last day", "Reported qty", "Verified qty", "Lines adjusted", "Progress from %", "Progress to %", "Contract items on the same WBS"],
    ...m.rows.map((r) => [
      r.unit_code,
      [r.wbs_code, r.wbs_name].filter(Boolean).join(" "),
      r.task_code ?? "",
      r.activity,
      r.uom ?? "",
      String(r.days),
      r.first_date,
      r.last_date,
      num(r.reported_qty),
      num(r.verified_qty),
      String(r.adjusted_lines),
      num(r.progress_from),
      num(r.progress_to),
      contractItemsFor(r, items).map((i) => i.item_code).join("; "),
    ]),
  ];
}
