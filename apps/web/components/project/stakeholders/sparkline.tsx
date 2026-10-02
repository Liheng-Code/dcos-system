import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  className?: string;
}

/**
 * Minimal inline-SVG sparkline. Scales `data` to a fixed 100x32 viewBox and strokes
 * a polyline in `currentColor` with a trailing dot. Pattern mirrors qs/cost-scurve.tsx.
 */
export function Sparkline({ data, className }: SparklineProps) {
  const w = 100;
  const h = 32;
  const pad = 3;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });

  const last = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full text-primary", className)}
    >
      <polyline
        points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {last && <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" />}
    </svg>
  );
}
