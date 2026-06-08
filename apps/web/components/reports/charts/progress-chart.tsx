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
} from "recharts";
import { ChartWrapper } from "@/components/reports/charts/chart-wrapper";

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
  formatTooltip?: (val: number, name: string) => string;
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
  formatTooltip,
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
          margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatY}
            domain={[0, 100]}
          />
          <Tooltip
            formatter={formatTooltip ? (val, name) => [formatTooltip(Number(val), String(name)), String(name)] : undefined}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
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
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
