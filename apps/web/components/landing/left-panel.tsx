"use client";

import { useEffect, useState } from "react";
import { ProjectCarousel } from "@/components/landing/project-carousel";
import { IsometricScene } from "@/components/landing/isometric-scene";
import { LandingKpiCard } from "@/components/landing/landing-kpi-card";
import { getLandingStats, type LandingStats } from "@/lib/landing-service";
import { cn } from "@/lib/utils";
import { Building2, Brain, Globe, ShieldCheck, GitBranch, LineChart, Lock, History, HardHat, Banknote } from "lucide-react";

const features = [
  {
    icon: ShieldCheck,
    text: "One Source of Truth",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
  },
  {
    icon: Building2,
    text: "Real-time Collaboration",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-400",
  },
  {
    icon: Brain,
    text: "AI-Powered Insights",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
  },
  {
    icon: GitBranch,
    text: "End-to-End Traceability",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-400",
  },
  {
    icon: LineChart,
    text: "Live Cost & Schedule Control",
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-400",
  },
  {
    icon: Globe,
    text: "Global Compliance",
    iconBg: "bg-rose-500/15",
    iconColor: "text-rose-400",
  },
];

const trustChips = [
  { icon: ShieldCheck, text: "Role-based access control" },
  { icon: Lock, text: "Encrypted in transit & at rest" },
  { icon: History, text: "Full audit trail" },
];

function formatCurrency(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function LeftPanel() {
  const [stats, setStats] = useState<LandingStats | null>(null);

  useEffect(() => {
    getLandingStats().then(setStats);
  }, []);

  return (
    <div className="relative flex flex-col justify-center overflow-hidden bg-zinc-900 text-white md:col-span-3 min-h-[50vh] md:min-h-screen">
      <ProjectCarousel />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/70 to-zinc-950/50" />
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/80 via-zinc-950/40 to-transparent" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #60a5fa 1px, transparent 1px), linear-gradient(to bottom, #60a5fa 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <IsometricScene />
      <div className="relative z-10 flex flex-col gap-6 px-8 md:px-12 lg:px-16 py-12 md:py-0">
        <div>
          <h1
            className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl [text-shadow:0_2px_16px_rgba(0,0,0,0.7)]"
          >
            DCOS System
          </h1>
          <p className="mt-3 max-w-lg text-lg font-medium text-white/90 sm:text-xl [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
            Next-Generation Construction Project Intelligence
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.text}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-sm"
            >
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-white/10", feature.iconBg)}>
                <feature.icon className={cn("h-4 w-4", feature.iconColor)} />
              </div>
              <span className="text-sm font-medium text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">{feature.text}</span>
            </div>
          ))}
        </div>
        {stats && stats.projectCount > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LandingKpiCard
              label="Projects Managed"
              value={String(stats.projectCount)}
              icon={HardHat}
              accentClass="bg-sky-500"
              iconBg="bg-sky-500/15"
              iconColor="text-sky-400"
              subtitle="Across all active portfolios"
              href="/dashboard/projects"
            />
            <LandingKpiCard
              label="Contract Value Tracked"
              value={formatCurrency(stats.totalContractValue)}
              icon={Banknote}
              accentClass="bg-emerald-500"
              iconBg="bg-emerald-500/15"
              iconColor="text-emerald-400"
              subtitle="Live BOQ & cost data"
              href="/dashboard/qs"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {trustChips.map((chip) => (
            <div
              key={chip.text}
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1 backdrop-blur-sm"
            >
              <chip.icon className="h-3 w-3 text-blue-400" />
              <span className="text-xs font-medium text-white/80">{chip.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
