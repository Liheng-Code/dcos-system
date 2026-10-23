"use client";

import { useMemo } from "react";
import {
  layoutLogicNetwork, RELATION_COLORS, RELATION_LABELS,
} from "@/lib/planning/activity-library/logic-network-layout";
import type { MasterLogic } from "@/lib/planning/activity-library/activity-database-service";
import type { Relation } from "@/lib/planning/activity-library/types";

const RELATIONS: Relation[] = ["fs", "ss", "ff", "sf"];

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Predecessor / successor diagram: inline SVG, theme-aware, clicking a neighbour opens that activity. */
export function LogicNetworkView({
  center, logic, onSelect,
}: {
  center: { id: string; visibleCode: string | null; code: string; name: string };
  logic: MasterLogic;
  onSelect: (id: string) => void;
}) {
  const { layout, info } = useMemo(() => {
    const info = new Map<string, { code: string; name: string }>();
    info.set(center.id, { code: center.visibleCode ?? center.code, name: center.name });
    const toN = (n: MasterLogic["predecessors"][number]) => {
      info.set(n.master.id, { code: n.master.visible_code ?? n.master.code, name: n.master.name });
      return { id: n.master.id, label: n.master.name, relation: n.relation, lagDays: n.lagDays };
    };
    const layout = layoutLogicNetwork({
      center: { id: center.id, label: center.name },
      predecessors: logic.predecessors.map(toN),
      successors: logic.successors.map(toN),
    });
    return { layout, info };
  }, [center, logic]);

  const empty = logic.predecessors.length === 0 && logic.successors.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {RELATIONS.map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: RELATION_COLORS[r] }} />
            <span className="font-semibold uppercase">{r}</span> {RELATION_LABELS[r]}
          </span>
        ))}
        <span>Edge label: relation(lag days)</span>
      </div>
      {empty && (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          This activity has no predecessors or successors yet. Add links in the List view.
        </div>
      )}
      <div className="overflow-auto rounded-md border border-border bg-card p-2">
        <svg
          width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img" aria-label="Predecessor and successor network" className="mx-auto block max-w-none"
        >
          <defs>
            {RELATIONS.map((r) => (
              <marker key={r} id={`arrow-${r}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={RELATION_COLORS[r]} />
              </marker>
            ))}
          </defs>
          {layout.edges.map((e) => (
            <path key={`${e.from}-${e.to}`} d={e.path} fill="none" stroke={RELATION_COLORS[e.relation]} strokeWidth={1.75} markerEnd={`url(#arrow-${e.relation})`} />
          ))}
          {layout.edges.map((e) => (
            <text
              key={`l-${e.from}-${e.to}`} x={e.labelX} y={e.labelY} textAnchor="middle" fontSize={10} fontWeight={600}
              className="fill-foreground" stroke="var(--card)" strokeWidth={3} paintOrder="stroke"
            >
              {e.label}
            </text>
          ))}
          {layout.nodes.map((n) => {
            const d = info.get(n.id);
            const isCenter = n.role === "center";
            const act = () => { if (!isCenter) onSelect(n.id); };
            return (
              <g
                key={`${n.role}-${n.id}`} transform={`translate(${n.x} ${n.y})`}
                role={isCenter ? undefined : "button"} tabIndex={isCenter ? undefined : 0} aria-label={isCenter ? undefined : `Open ${d?.name ?? ""}`}
                onClick={act} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } }}
                className={isCenter ? undefined : "cursor-pointer outline-none [&:focus-visible>rect]:stroke-ring [&:hover>rect]:stroke-primary"}
              >
                <title>{d ? `${d.code} ${d.name}` : n.label}</title>
                <rect
                  width={n.w} height={n.h} rx={8}
                  className={isCenter ? "fill-primary/15 stroke-primary" : "fill-background stroke-border"} strokeWidth={isCenter ? 2 : 1}
                />
                <text x={10} y={20} fontSize={11} fontWeight={600} className="fill-primary" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {d?.code ?? ""}
                </text>
                <text x={10} y={38} fontSize={12} className="fill-foreground">{clip(d?.name ?? n.label, 28)}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
