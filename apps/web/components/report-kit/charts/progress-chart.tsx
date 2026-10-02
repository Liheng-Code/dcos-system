"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { ChartWrapper } from "@/components/report-kit/charts/chart-wrapper";

interface LineSeries {
  dataKey: string;
  name: string;
  color: string;
  strokeDasharray?: string;
}

interface ProgressChartProps {
  data: Record<string, unknown>[];
  series: LineSeries[];
  xKey: string;
  loading?: boolean;
  empty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  title?: string;
  description?: string;
  height?: number;
  formatY?: (val: number) => string;
  formatX?: (val: string) => string;
  formatTooltip?: (val: number, name: string) => string;
  /** Y-axis domain — defaults to a fixed 0–100 (percent). Use `[0, "auto"]` for cost. */
  yDomain?: [number | "auto", number | "auto"];
  /** Draws a vertical "as of today" reference line at this x-value (must match one of `data`'s `xKey` values exactly). */
  todayX?: string;
  /** Pre-formatted value shown as a label at the top of the today line, e.g. "72.4%". */
  todayLabel?: string;
}

export function ProgressChart({
  data,
  series,
  xKey,
  loading,
  empty,
  error,
  onRetry,
  title,
  description,
  height = 280,
  formatY,
  formatX,
  formatTooltip,
  yDomain = [0, 100],
  todayX,
  todayLabel,
}: ProgressChartProps) {
  return (
    <ChartWrapper
      title={title}
      description={description}
      loading={loading}
      empty={empty}
      error={error}
      onRetry={onRetry}
      height={height}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data as Record<string, number | string>[]}
          margin={{ top: 22, right: 8, left: -8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={formatX}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatY}
            domain={yDomain}
          />
          <Tooltip
            formatter={formatTooltip ? (val, name) => [formatTooltip(Number(val), String(name)), String(name)] : undefined}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
            }}
            labelStyle={{ color: "var(--popover-foreground)" }}
          />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.strokeDasharray}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
          {todayX && (
            <ReferenceLine
              x={todayX}
              stroke="#dc2626"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              label={
                todayLabel
                  ? {
                      value: todayLabel,
                      position: "insideTopRight",
                      fill: "#dc2626",
                      fontSize: 12,
                      fontWeight: 700,
                      offset: 8,
                    }
                  : undefined
              }
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
