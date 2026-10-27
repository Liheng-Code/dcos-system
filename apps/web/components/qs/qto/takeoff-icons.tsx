// Take-off tool icons: 24 × 24, two-tone, drawn to read like the on-sheet result of each tool.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

const node = (cx: number, cy: number, color: string) => <rect x={cx - 1.8} y={cy - 1.8} width={3.6} height={3.6} rx={0.6} fill="#fff" stroke={color} strokeWidth={1.4} />;

export function PanIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4.6 15.6a1.6 1.6 0 0 1 2.5-2L8 14.6" stroke="#475569" strokeWidth={1.6} />
    </Svg>
  );
}

export function ScaleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8v8M21 8v8" stroke="#b45309" strokeWidth={1.6} />
      <path d="M3 12h18" stroke="#b45309" strokeWidth={1.6} />
      <path d="M6 10l-3 2 3 2M18 10l3 2-3 2" stroke="#b45309" strokeWidth={1.6} />
      <rect x={8} y={4} width={8} height={4.5} rx={1} fill="#fef3c7" stroke="#b45309" strokeWidth={1.2} />
      <path d="M10 6.2h4" stroke="#b45309" strokeWidth={1.2} />
    </Svg>
  );
}

export function LengthIcon(p: IconProps) {
  const c = "#1d4ed8";
  return (
    <Svg {...p}>
      <path d="M5 19L19 5" stroke={c} strokeWidth={2} />
      {node(5, 19, c)}
      {node(19, 5, c)}
    </Svg>
  );
}

export function PolylineIcon(p: IconProps) {
  const c = "#1d4ed8";
  return (
    <Svg {...p}>
      <path d="M4 18V6h9v12h7" stroke={c} strokeWidth={2} />
      {node(4, 18, c)}
      {node(4, 6, c)}
      {node(13, 6, c)}
      {node(13, 18, c)}
      {node(20, 18, c)}
    </Svg>
  );
}

export function AreaIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7l9-3 7 6-3 10H6z" fill="#22c55e" fillOpacity={0.85} stroke="#15803d" strokeWidth={1.6} />
    </Svg>
  );
}

export function PerimeterIcon(p: IconProps) {
  const c = "#0f766e";
  return (
    <Svg {...p}>
      <path d="M4 7l9-3 7 6-3 10H6z" stroke={c} strokeWidth={2} strokeDasharray="3 2.2" />
      {node(4, 7, c)}
      {node(20, 10, c)}
      {node(6, 20, c)}
    </Svg>
  );
}

export function CountIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx={7} cy={7} r={3.2} fill="#c2410c" />
      <circle cx={17} cy={9} r={3.2} fill="#c2410c" />
      <circle cx={10} cy={17.5} r={3.2} fill="#c2410c" />
    </Svg>
  );
}

export function PointIcon(p: IconProps) {
  const c = "#be123c";
  return (
    <Svg {...p}>
      <circle cx={12} cy={12} r={6.5} stroke={c} strokeWidth={1.6} />
      <path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" stroke={c} strokeWidth={1.6} />
      <circle cx={12} cy={12} r={1.6} fill={c} />
    </Svg>
  );
}

export function BoxModeIcon(p: IconProps) {
  return (
    <Svg size={16} {...p}>
      <rect x={4} y={6} width={16} height={12} rx={1} stroke="currentColor" strokeWidth={1.8} />
      <path d="M2 4l4 4M22 20l-4-4" stroke="currentColor" strokeWidth={1.5} />
    </Svg>
  );
}

export function PointModeIcon(p: IconProps) {
  return (
    <Svg size={16} {...p}>
      <path d="M4 17l4-11 8 3 4 9z" stroke="currentColor" strokeWidth={1.8} />
      <circle cx={4} cy={17} r={1.6} fill="currentColor" />
      <circle cx={8} cy={6} r={1.6} fill="currentColor" />
      <circle cx={16} cy={9} r={1.6} fill="currentColor" />
      <circle cx={20} cy={18} r={1.6} fill="currentColor" />
    </Svg>
  );
}
