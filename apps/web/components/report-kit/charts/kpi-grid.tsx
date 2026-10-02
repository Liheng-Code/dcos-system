"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface KpiCard {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  color?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  onClick?: () => void;
}

interface KpiGridProps {
  cards: KpiCard[];
  columns?: 2 | 3 | 4 | 5;
  loading?: boolean;
}

const TREND_ICONS: Record<string, string> = {
  up: "\u2191",
  down: "\u2193",
  neutral: "\u2192",
};

const COL_CLASSES: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export function KpiGrid({ cards, columns = 4, loading }: KpiGridProps) {
  if (loading) {
    return (
      <div className={cn("grid gap-3", COL_CLASSES[columns])}>
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-100 bg-white p-4 animate-pulse"
          >
            <div className="h-3 w-20 rounded bg-slate-100 mb-2" />
            <div className="h-6 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-3", COL_CLASSES[columns])}>
      {cards.map((card, i) => (
        <div
          key={i}
          className={cn(
            "rounded-xl border border-slate-100 bg-white p-4 transition-colors",
            card.onClick && "cursor-pointer hover:border-slate-200 hover:shadow-sm",
          )}
          onClick={card.onClick}
          role={card.onClick ? "button" : undefined}
          tabIndex={card.onClick ? 0 : undefined}
          onKeyDown={
            card.onClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    card.onClick?.();
                  }
                }
              : undefined
          }
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            {card.icon && (
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg",
                  card.color ?? "bg-slate-50 text-slate-400",
                )}
              >
                {card.icon}
              </div>
            )}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl font-semibold text-slate-900">
              {card.value}
            </span>
            {card.trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-medium",
                  card.trend === "up" && "text-emerald-600",
                  card.trend === "down" && "text-red-500",
                  card.trend === "neutral" && "text-slate-400",
                )}
              >
                <span>{TREND_ICONS[card.trend]}</span>
                {card.trendLabel}
              </span>
            )}
          </div>
          {card.subtitle && (
            <p className="mt-0.5 text-[10px] text-slate-400">{card.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  );
}
