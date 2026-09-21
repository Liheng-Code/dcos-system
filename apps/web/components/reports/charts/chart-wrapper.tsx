"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartWrapperProps {
  title?: string;
  description?: string;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  error?: string | null;
  onRetry?: () => void;
  children: ReactNode;
  className?: string;
  height?: number;
}

export function ChartWrapper({
  title,
  description,
  loading,
  empty,
  emptyMessage = "No data available",
  error,
  onRetry,
  children,
  className,
  height = 280,
}: ChartWrapperProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {(title || description) && (
        <div className="px-3 pt-3 pb-1">
          {title && (
            <p className="text-xs font-semibold text-foreground">{title}</p>
          )}
          {description && (
            <p className="text-[10px] text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div
        className="relative flex items-center justify-center"
        style={{ minHeight: height }}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <div className="flex flex-col items-center gap-1 px-4 text-center">
            <p className="text-xs text-red-500">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
              >
                Retry
              </button>
            )}
          </div>
        ) : empty ? (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
