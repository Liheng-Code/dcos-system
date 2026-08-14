"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  subtitle?: string;
  href?: string;
  accentClass?: string;
  gradient?: string;
  className?: string;
}

export function KPICard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  trend,
  trendLabel,
  subtitle,
  href,
  accentClass,
  gradient,
  className,
}: KPICardProps) {
  const body = (
    <>
      {gradient ? (
        <div className={cn("h-1 shrink-0 rounded-t-xl bg-gradient-to-r", gradient)} />
      ) : (
        accentClass && <div className={cn("h-1 shrink-0 rounded-t-xl", accentClass)} />
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {Icon && (
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm",
                gradient
                  ? cn("bg-gradient-to-br", gradient)
                  : cn("ring-1 ring-inset ring-black/5", iconBg ?? "bg-primary/10")
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", gradient ? "text-white" : cn(iconColor ?? "text-primary"))} />
            </div>
          )}
        </div>

        <p className="mt-3 text-[28px] font-bold leading-none tracking-tight tabular-nums">{value}</p>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
          {trend ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium">
              {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
              {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
              {trend === "flat" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
              <span
                className={cn(
                  trend === "up" && "text-emerald-600",
                  trend === "down" && "text-red-600",
                  trend === "flat" && "text-muted-foreground"
                )}
              >
                {trendLabel}
              </span>
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{subtitle}</span>
          )}
          {trend && subtitle && (
            <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg hover:shadow-black/5",
          className
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md hover:shadow-black/5",
        className
      )}
    >
      {body}
    </div>
  );
}
