"use client";

import Link from "next/link";
import { ArrowRight, ArrowUp, CheckCircle2, Compass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { QS_GROUPS } from "@/lib/qs/qs-nav";
import {
  QS_GLANCE_STAGES, QS_RELATED_MODULES, QS_PROJECT_DATA_ITEMS,
  QS_OUTPUT_ITEMS, QS_DATA_FLOW_MODULES, QS_KEY_BENEFITS,
  type GlanceStage, type SideCardItem,
} from "@/lib/qs/qs-overview-data";

const COLOR_CLASSES: Record<GlanceStage["color"], { bar: string; chip: string; icon: string }> = {
  "chart-1": { bar: "bg-chart-1", chip: "bg-chart-1/15", icon: "text-chart-1" },
  primary: { bar: "bg-primary", chip: "bg-primary/15", icon: "text-primary" },
  "chart-2": { bar: "bg-chart-2", chip: "bg-chart-2/15", icon: "text-chart-2" },
  "chart-3": { bar: "bg-chart-3", chip: "bg-chart-3/15", icon: "text-chart-3" },
  "chart-5": { bar: "bg-chart-5", chip: "bg-chart-5/15", icon: "text-chart-5" },
};

function GlanceCard({ stage }: { stage: GlanceStage }) {
  const c = COLOR_CLASSES[stage.color];
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className={`h-1.5 w-full ${c.bar}`} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.chip} ${c.icon}`}>
            <stage.icon className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-semibold leading-tight text-foreground">{stage.label}</p>
        </div>
        <ul className="space-y-1">
          {stage.items.map((item) => (
            <li key={item} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
              <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${c.bar}`} />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SideCard({ title, items }: { title: string; items: SideCardItem[] }) {
  return (
    <div className="flex w-full flex-col rounded-xl border border-border bg-muted/40 p-3 lg:w-44">
      <p className="mb-2 text-center text-xs font-semibold text-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => {
          const content = (
            <span className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] text-foreground/85 transition-colors hover:bg-muted hover:text-foreground">
              <item.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{item.label}</span>
            </span>
          );
          return (
            <li key={item.label}>
              {item.href ? <Link href={item.href}>{content}</Link> : content}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 7 QS nav groups (vs Planning's 3) — cycle the app's chart-* tokens.
const GROUP_COLOR: Record<string, { bar: string; chip: string }> = {
  tendering: { bar: "bg-chart-1", chip: "bg-chart-1/10" },
  cost_rate_library: { bar: "bg-primary", chip: "bg-primary/10" },
  libraries: { bar: "bg-chart-2", chip: "bg-chart-2/10" },
  cost_control: { bar: "bg-chart-3", chip: "bg-chart-3/10" },
  subcontractor: { bar: "bg-chart-5", chip: "bg-chart-5/10" },
  qto: { bar: "bg-chart-1", chip: "bg-chart-1/10" },
  contract_admin: { bar: "bg-primary", chip: "bg-primary/10" },
};

/**
 * Static explainer poster for QS/Overview — modeled directly on
 * `planning-overview-infographic.tsx`, built from this app's real nav data
 * (`QS_GROUPS`) and real module list rather than generic placeholders. Purely
 * informational: every link is a real route, nothing here fetches data, so
 * it renders instantly regardless of project selection.
 */
export function QsOverviewInfographic() {
  return (
    <div className="space-y-4">
      {/* 1. QS at a Glance */}
      <Card gradient={false} className="overflow-visible">
        <div className="space-y-1 px-4 pt-1">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">QS at a Glance</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            One lifecycle, five stages — from tender pricing to a defensible final account.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-4 pb-4 lg:flex-row lg:items-stretch">
          {QS_GLANCE_STAGES.map((stage, i) => (
            <div key={stage.id} className="flex flex-1 items-stretch gap-2">
              <GlanceCard stage={stage} />
              {i < QS_GLANCE_STAGES.length - 1 && (
                <div className="hidden shrink-0 items-center lg:flex">
                  <ArrowRight className="h-4 w-4 text-muted-foreground/60" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 2. Core Functions & Cross-Module Integration */}
      <Card gradient={false} className="overflow-visible">
        <div className="space-y-1 px-4 pt-1">
          <h2 className="text-sm font-semibold text-foreground">Core Functions & Cross-Module Integration</h2>
          <p className="text-xs text-muted-foreground">
            QS sits at the commercial center of the project — every other module feeds it data or consumes what it produces.
          </p>
        </div>

        <div className="px-4 pb-4">
          {/* Related modules row, pointing down into the QS Module box */}
          <p className="mb-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Related Modules
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {QS_RELATED_MODULES.map((m) => (
              <Link
                key={m.key}
                href={m.href}
                className="flex w-[76px] flex-col items-center gap-1 rounded-lg border border-border bg-card px-2 py-2 text-center transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <m.icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10.5px] leading-tight text-foreground/85">{m.label}</span>
              </Link>
            ))}
          </div>
          <div className="flex justify-center py-1">
            <ArrowDownConnector />
          </div>

          {/* Project Data | QS Module | Outputs */}
          <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-start lg:justify-center">
            <SideCard title="Project Data" items={QS_PROJECT_DATA_ITEMS} />

            <div className="flex flex-1 items-center gap-2">
              <div className="hidden items-center lg:flex">
                <ArrowRight className="h-4 w-4 rotate-180 text-muted-foreground/50" />
              </div>
              <div className="flex-1 rounded-xl border-2 border-primary/30 bg-primary/[0.04] p-3">
                <p className="mb-2 text-center text-sm font-semibold text-foreground">Quantity Surveying Module</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {QS_GROUPS.map((group, gi) => {
                    const c = GROUP_COLOR[group.key] ?? GROUP_COLOR.cost_control;
                    const visibleItems = group.items.filter((item) => !item.hidden);
                    return (
                      <div key={group.key} className="overflow-hidden rounded-lg border border-border bg-card">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-foreground ${c.chip}`}>
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${c.bar}`}>
                            {gi + 1}
                          </span>
                          {group.label}
                        </div>
                        <ul className="space-y-0.5 p-1.5">
                          {visibleItems.map((item) => (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                className="block truncate rounded-md px-1.5 py-1 text-[11.5px] text-foreground/85 transition-colors hover:bg-muted hover:text-foreground"
                              >
                                {item.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="hidden items-center lg:flex">
                <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
              </div>
            </div>

            <SideCard title="Outputs" items={QS_OUTPUT_ITEMS} />
          </div>

          <div className="flex justify-center py-1">
            <ArrowDownConnector />
          </div>

          {/* Data & Information Flow Across Modules */}
          <p className="mb-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Data & Information Flow Across Modules
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {QS_DATA_FLOW_MODULES.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                className="flex w-[92px] flex-col items-center gap-1 rounded-lg border border-border bg-card px-2 py-2 text-center transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <m.icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10.5px] font-medium leading-tight text-foreground/85">{m.label}</span>
                <span className="text-[9.5px] leading-tight text-muted-foreground">{m.caption}</span>
              </Link>
            ))}
          </div>
        </div>
      </Card>

      {/* 3. Key Benefits footer */}
      <Card gradient={false} className="overflow-visible">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-xs font-semibold text-foreground">Key Benefits</span>
          {QS_KEY_BENEFITS.map((b) => (
            <span key={b} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-chart-2" />
              {b}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ArrowDownConnector() {
  return <ArrowUp className="h-4 w-4 rotate-180 text-muted-foreground/40" />;
}
