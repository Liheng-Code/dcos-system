"use client";

// Site measurement for one subcontract: the quantities its reporting units
// reported in daily reports, and what the approver verified, over a period.
// Shown on the subcontract page next to the payment certificates (design §6,
// D15). Read-only: it informs the QS and writes nothing to a certificate.

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv-export";
import {
  contractItemsFor,
  getSubcontractMeasurement,
  measurementCsv,
  type ContractItemRef,
  type SubcontractMeasurement,
} from "@/lib/construction/daily-reporting/measurement";
import { Flag, inputClass, todayIso } from "./dr-ui";

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 3 }));

export interface MeasurementPeriod {
  label: string;
  from: string;
  to: string;
}

export function DrSubcontractMeasurement({
  subcontractId,
  subcontractNo,
  items,
  periods = [],
}: {
  subcontractId: string;
  subcontractNo: string;
  /** The subcontract's priced items, to point each activity at the items on the same WBS. */
  items: ContractItemRef[];
  /** Payment certificate periods, offered as shortcuts. */
  periods?: MeasurementPeriod[];
}) {
  const [from, setFrom] = useState(() => `${todayIso().slice(0, 8)}01`);
  const [to, setTo] = useState(todayIso);
  const [loaded, setLoaded] = useState<{ key: string; data: SubcontractMeasurement } | null>(null);
  const key = `${from}|${to}`;
  const valid = !!from && !!to && from <= to;

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    getSubcontractMeasurement(subcontractId, from, to)
      .then((data) => !cancelled && setLoaded({ key: `${from}|${to}`, data }))
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : String(e));
        setLoaded({ key: `${from}|${to}`, data: { units: [], coverage: { approved: 0, pending: 0, no_work: 0 }, rows: [] } });
      });
    return () => {
      cancelled = true;
    };
  }, [subcontractId, from, to, valid]);

  const data = loaded?.key === key ? loaded.data : null;
  const rows = useMemo(() => data?.rows ?? [], [data]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-medium">For reference when certifying. Not a measurement for payment.</p>
        <p className="mt-0.5 text-xs">
          Quantities come from approved daily reports. &quot;Reported&quot; is what the site team stated; &quot;verified&quot; is what the approver
          accepted after checking on site. Certified quantities are entered on the payment certificate by the QS and are never taken from here
          automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">From</span>
          <input type="date" className={cn(inputClass, "w-auto")} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">To</span>
          <input type="date" className={cn(inputClass, "w-auto")} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {periods.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Certificate period</span>
            <select
              className={cn(inputClass, "w-auto")}
              value={periods.findIndex((p) => p.from === from && p.to === to)}
              onChange={(e) => {
                const p = periods[Number(e.target.value)];
                if (p) {
                  setFrom(p.from);
                  setTo(p.to);
                }
              }}
            >
              <option value={-1}>Choose…</option>
              {periods.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!data || rows.length === 0}
          onClick={() => data && downloadCsv(`site-measurement-${subcontractNo}-${from}-to-${to}.csv`, measurementCsv(data, items))}
        >
          <Download className="mr-1 h-4 w-4" /> Export
        </Button>
      </div>

      {!valid ? (
        <p className="text-sm text-red-700">The start date must not be after the end date.</p>
      ) : !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data.units.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No reporting unit is linked to this subcontract. Link one in Construction › Daily Reporting › Setup, on the reporting unit.
        </div>
      ) : (
        <>
          <p className="text-sm">
            {data.units.map((u) => `${u.display_name} (${u.unit_code})`).join(", ")} · {data.coverage.approved} approved report
            {data.coverage.approved === 1 ? "" : "s"} in the period
            {data.coverage.no_work > 0 ? `, ${data.coverage.no_work} of them "no work"` : ""}
          </p>
          {data.coverage.pending > 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {data.coverage.pending} report{data.coverage.pending === 1 ? " is" : "s are"} not approved yet and {data.coverage.pending === 1 ? "is" : "are"} not
              included. The figures below are incomplete until the Project Manager decides on {data.coverage.pending === 1 ? "it" : "them"}.
            </p>
          ) : null}

          {rows.length === 0 ? (
            <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No approved quantities in this period.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    {data.units.length > 1 ? <th className="px-3 py-2">Unit</th> : null}
                    <th className="px-3 py-2">Activity</th>
                    <th className="px-3 py-2">WBS</th>
                    <th className="px-3 py-2 text-right">Days</th>
                    <th className="px-3 py-2 text-right">Reported</th>
                    <th className="px-3 py-2 text-right">Verified</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2 text-right">Progress</th>
                    <th className="px-3 py-2">Contract items on the same WBS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const matches = contractItemsFor(r, items);
                    return (
                      <tr key={i} className="border-t border-border align-top">
                        {data.units.length > 1 ? <td className="px-3 py-2 text-xs">{r.unit_code}</td> : null}
                        <td className="px-3 py-2">
                          <p className="font-medium">{r.activity}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.task_code ? `${r.task_code} · ` : "Not on the plan · "}
                            {r.first_date === r.last_date ? r.first_date : `${r.first_date} → ${r.last_date}`}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs">{[r.wbs_code, r.wbs_name].filter(Boolean).join(" ") || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.days}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(r.reported_qty)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {fmt(r.verified_qty)}
                          {r.adjusted_lines > 0 ? (
                            <span className="mt-0.5 block font-normal">
                              <Flag>adjusted on {r.adjusted_lines} day{r.adjusted_lines === 1 ? "" : "s"}</Flag>
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">{r.uom ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">
                          {r.progress_to === null ? "—" : r.progress_from !== null && r.progress_from !== r.progress_to ? `${r.progress_from}% → ${r.progress_to}%` : `${r.progress_to}%`}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {matches.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            matches.map((m) => (
                              <span key={m.id} className="block">
                                <span className="font-mono">{m.item_code}</span> · contract {fmt(Number(m.quantity))} {m.unit}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
