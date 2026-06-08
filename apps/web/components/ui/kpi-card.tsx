"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
  className?: string;
}

export function KPICard({
  label, value, icon: Icon, iconColor, iconBg,
  trend, trendLabel, subtitle, className,
}: KPICardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", iconBg ?? "bg-primary/10")}>
              <Icon className={cn("h-5 w-5", iconColor ?? "text-primary")} />
            </div>
          )}
        </div>
        {trend && (
          <div className="mt-2 flex items-center gap-1.5">
            {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
            {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
            {trend === "flat" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
            {trendLabel && (
              <span className={cn(
                "text-xs font-medium",
                trend === "up" && "text-emerald-600",
                trend === "down" && "text-red-600",
                trend === "flat" && "text-muted-foreground",
              )}>
                {trendLabel}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
