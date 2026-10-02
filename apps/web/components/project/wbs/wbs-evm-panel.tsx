"use client";

import { useMemo } from "react";
import { type WbsTaskRecord } from "@/components/project/wbs/wbs-types";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

interface Props {
  tasks: WbsTaskRecord[];
}

function fmt(n: number | null, prefix = "$") {
  if (n == null) return "—";
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtRatio(n: number | null) {
  if (n == null) return "—";
  return n.toFixed(2);
}

function Indicator({ label, value, good, neutral = false, tooltip }: {
  label: string;
  value: string;
  good: boolean | null;
  neutral?: boolean;
  tooltip?: string;
}) {
  const color =
    neutral ? "text-slate-700" :
    good === true ? "text-emerald-700" :
    good === false ? "text-red-700" :
    "text-slate-400";
  const bg =
    neutral ? "bg-slate-50" :
    good === true ? "bg-emerald-50" :
    good === false ? "bg-red-50" :
    "bg-slate-50";

  return (
    <div className={cn("rounded-xl p-3 text-center", bg)}>
      <div className={cn("text-base font-bold tabular-nums", color)}>{value}</div>
      <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] text-slate-500">
        {label}
        {tooltip && (
          <span className="group relative cursor-help">
            <Info className="h-2.5 w-2.5 text-slate-300" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[9px] text-white opacity-0 group-hover:opacity-100">
              {tooltip}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export function WbsEvmPanel({ tasks }: Props) {
  const evm = useMemo(() => {
    const now = Date.now();

    let bac = 0, ev = 0, ac = 0, pv = 0;

    for (const t of tasks) {
      const budget = t.budget_cost ?? 0;
      const actual = t.actual_cost ?? 0;
      bac += budget;
      ev  += budget * (t.progress / 100);
      ac  += actual;

      // Planned Value: time-linear interpolation using baseline dates
      if (t.baseline_start_date && t.baseline_finish_date && budget > 0) {
        const bs = new Date(t.baseline_start_date).getTime();
        const bf = new Date(t.baseline_finish_date).getTime();
        if (now >= bf) {
          pv += budget;
        } else if (now > bs && bf > bs) {
          pv += budget * ((now - bs) / (bf - bs));
        }
      }
    }

    if (bac === 0) return null;

    const cpi = ac > 0 ? ev / ac : null;
    const spi = pv > 0 ? ev / pv : null;
    const eac = cpi && cpi > 0 ? bac / cpi : null;
    const vac = eac !== null ? bac - eac : null;
    const cv  = ev - ac;
    const sv  = ev - pv;

    return { bac, ev, ac, pv, cpi, spi, eac, vac, cv, sv };
  }, [tasks]);

  const baselinedCount = tasks.filter((t) => t.baseline_finish_date).length;

  if (!evm) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
        <p className="text-xs text-slate-400">No budget data. Add budget_cost to tasks to enable EVM.</p>
      </div>
    );
  }

  if (baselinedCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
        <p className="text-xs text-slate-400">Set a baseline for tasks to compute Planned Value (PV) and SPI.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* EVM base values */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Indicator label="BAC" value={fmt(evm.bac)} good={null} neutral tooltip="Budget at Completion" />
        <Indicator label="EV (BCWP)" value={fmt(evm.ev)} good={null} neutral tooltip="Earned Value" />
        <Indicator label="PV (BCWS)" value={fmt(evm.pv)} good={null} neutral tooltip="Planned Value (time-based)" />
        <Indicator label="AC (ACWP)" value={fmt(evm.ac)} good={null} neutral tooltip="Actual Cost" />
      </div>

      {/* Performance indices */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Indicator
          label="CPI"
          value={fmtRatio(evm.cpi)}
          good={evm.cpi !== null ? evm.cpi >= 1 : null}
          tooltip="Cost Performance Index = EV/AC. ≥1 = under budget"
        />
        <Indicator
          label="SPI"
          value={fmtRatio(evm.spi)}
          good={evm.spi !== null ? evm.spi >= 1 : null}
          tooltip="Schedule Performance Index = EV/PV. ≥1 = ahead of schedule"
        />
        <Indicator
          label="CV"
          value={`${evm.cv >= 0 ? "+" : ""}${fmt(evm.cv)}`}
          good={evm.cv >= 0}
          tooltip="Cost Variance = EV − AC. Positive = under budget"
        />
        <Indicator
          label="SV"
          value={`${evm.sv >= 0 ? "+" : ""}${fmt(evm.sv)}`}
          good={evm.sv >= 0}
          tooltip="Schedule Variance = EV − PV. Positive = ahead of schedule"
        />
      </div>

      {/* Forecast */}
      <div className="grid grid-cols-2 gap-2">
        <Indicator
          label="EAC"
          value={fmt(evm.eac)}
          good={evm.eac !== null ? evm.eac <= evm.bac : null}
          tooltip="Estimate at Completion = BAC / CPI"
        />
        <Indicator
          label="VAC"
          value={`${(evm.vac ?? 0) >= 0 ? "+" : ""}${fmt(evm.vac)}`}
          good={evm.vac !== null ? evm.vac >= 0 : null}
          tooltip="Variance at Completion = BAC − EAC. Positive = expected under budget"
        />
      </div>

      <p className="text-[10px] text-slate-400">
        {baselinedCount} of {tasks.length} tasks have a baseline set.
        PV is computed using time-linear interpolation over baseline start/finish dates.
      </p>
    </div>
  );
}
