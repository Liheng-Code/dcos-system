"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  className?: string;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  action?: ReactNode;
  gradient?: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  description,
  className,
  loading,
  empty,
  emptyText = "No data yet",
  action,
  gradient,
  children,
}: ChartCardProps) {
  return (
    <Card className={cn("relative flex flex-col", className)} gradient={gradient}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 flex-col gap-2 py-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-40 w-full rounded-md" />
          </div>
        ) : empty ? (
          <div className="flex flex-1 items-center justify-center py-8 text-center text-xs text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
