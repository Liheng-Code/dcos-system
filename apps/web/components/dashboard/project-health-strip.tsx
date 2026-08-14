"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Gauge, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ratio, percent, currency } from "@/lib/evm-service";
import type { EvmMetrics } from "@/lib/evm-service";

export interface HealthMetrics {
  total: number;
  complete: number;
  active: number;
  notStarted: number;
  atRisk: number;
  progress: number;
}

interface ProjectHealthStripProps {
  projectName?: string;
  projectCode?: string;
  progress: number;
  metrics: HealthMetrics;
  evm: EvmMetrics | null;
  budget: number;
  actual: number;
}

function toneFor(value: number | null | undefined, badBelow: number): { text: string; badge: string } {
  if (value == null || !Number.isFinite(value)) return { text: "text-muted-foreground", badge: "text-muted-foreground" };
  if (value < badBelow) return { text: "text-red-600", badge: "bg-red-50 text-red-700" };
  if (value < 1) return { text: "text-amber-600", badge: "bg-amber-50 text-amber-700" };
  return { text: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700" };
}

export function ProjectHealthStrip({
  projectName,
  projectCode,
  progress,
  metrics,
  evm,
  budget,
  actual,
}: ProjectHealthStripProps) {
  const spi = evm?.spi ?? null;
  const cpi = evm?.cpi ?? null;
  const spiTone = toneFor(spi, 0.95);
  const cpiTone = toneFor(cpi, 0.95);
  const burn = budget > 0 ? Math.min(100, (actual / budget) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-background p-4">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-600" />
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {projectName ?? "Project"}
            {projectCode && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {projectCode}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  progress >= 70 ? "bg-emerald-500" : progress >= 40 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums">{percent(progress)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics.complete} done · {metrics.active} active · {metrics.atRisk} at risk
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <HealthStat
            icon={<Gauge className="h-4 w-4" />}
            label="SPI"
            value={ratio(spi)}
            tone={spiTone}
            hint={spi != null && spi < 1 ? "behind schedule" : spi != null ? "ahead" : "n/a"}
            gradient="from-amber-500 to-orange-600"
          />
          <HealthStat
            icon={<TrendingUp className="h-4 w-4" />}
            label="CPI"
            value={ratio(cpi)}
            tone={cpiTone}
            hint={cpi != null && cpi < 1 ? "over budget" : cpi != null ? "healthy" : "n/a"}
            gradient="from-emerald-500 to-teal-600"
          />
          <HealthStat
            icon={<CircleDollarSign className="h-4 w-4" />}
            label="Burn"
            value={`${burn.toFixed(0)}%`}
            tone={{ text: "text-foreground", badge: "text-muted-foreground" }}
            hint={`${currency(actual)} of ${currency(budget)}`}
            gradient="from-blue-500 to-indigo-600"
          />
        </div>

        <Link
          href="/dashboard/planning"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          Planning <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function HealthStat({
  icon,
  label,
  value,
  tone,
  hint,
  gradient,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: { text: string; badge: string };
  hint: string;
  gradient: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg shadow-sm bg-gradient-to-br",
          gradient
        )}
      >
        <div className="h-4 w-4 text-white">{icon}</div>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("text-base font-bold tabular-nums leading-tight", tone.text)}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
