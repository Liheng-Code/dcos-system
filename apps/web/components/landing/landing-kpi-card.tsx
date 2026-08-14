"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface LandingKpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accentClass: string;
  iconBg: string;
  iconColor: string;
  subtitle?: string;
  href?: string;
}

export function LandingKpiCard({
  label,
  value,
  icon: Icon,
  accentClass,
  iconBg,
  iconColor,
  subtitle,
  href,
}: LandingKpiCardProps) {
  const body = (
    <>
      <div className={cn("h-1 shrink-0 rounded-t-2xl", accentClass)} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{label}</p>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-white/10", iconBg)}>
            <Icon className={cn("h-[18px] w-[18px]", iconColor)} />
          </div>
        </div>
        <p className="mt-3 text-3xl font-bold leading-none tracking-tight tabular-nums text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
          {value}
        </p>
        {subtitle && (
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
            <span className="truncate text-[11px] text-white/50">{subtitle}</span>
          </div>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {body}
    </div>
  );
}
