"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  emptyPartSelection,
  FLOOR_BLOCK_LABELS,
  FLOOR_BLOCK_TYPES,
  getPart,
  nodeCheckState,
  taskIncluded,
  toggleNodeSelection,
  toggleTaskSelection,
  type CheckState,
  type TemplatePartId,
  type TemplateSelection,
  type TplNode,
  type TplPart,
  type WbsTemplateDoc,
} from "@/lib/project/wbs/wbs-template";

interface TemplateSelectionTreeProps {
  doc: WbsTemplateDoc;
  selection: TemplateSelection;
  onChange: (selection: TemplateSelection) => void;
}

function TriCheckbox({ state, disabled, onChange, label }: { state: CheckState; disabled?: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={state !== "off"}
      disabled={disabled}
      ref={(el) => { if (el) el.indeterminate = state === "partial"; }}
      onChange={(e) => onChange(e.target.checked)}
      className="h-3.5 w-3.5 shrink-0 accent-primary disabled:opacity-50"
    />
  );
}

const isUnder = (key: string, root: string) => key === root || key.startsWith(`${root}.`);

function countIn(part: TplPart, sel: ReturnType<typeof emptyPartSelection>, root: string | null) {
  const list = root === null ? part.tasks : part.tasks.filter((t) => (root === "" ? t.node_key === "" : isUnder(t.node_key, root)));
  return { total: list.length, on: list.filter((t) => taskIncluded(sel, t)).length };
}

/** Tick / untick the template's packages and activities before applying it (this import only). */
export function TemplateSelectionTree({ doc, selection, onChange }: TemplateSelectionTreeProps) {
  const [partId, setPartId] = useState<TemplatePartId>("sections");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const parts = (["sections", ...FLOOR_BLOCK_TYPES.filter((t) => doc.floor_blocks[t])] as TemplatePartId[]);
  const active = parts.includes(partId) ? partId : "sections";
  const part = getPart(doc, active)!;
  const sel = selection[active] ?? emptyPartSelection();

  const ordered = useMemo(() => {
    const byParent = new Map<string, TplNode[]>();
    for (const n of part.nodes) byParent.set(n.parent_key, [...(byParent.get(n.parent_key) ?? []), n]);
    const out: { node: TplNode; depth: number }[] = [];
    const walk = (parent: string, depth: number) => {
      for (const n of [...(byParent.get(parent) ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
        out.push({ node: n, depth });
        walk(n.key, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [part.nodes]);

  // Buildings are created under the anchor: it and its parents can't be unticked.
  const locked = (key: string) => active === "sections" && !!doc.building_anchor_key && isUnder(doc.building_anchor_key, key);
  const setSel = (next: ReturnType<typeof emptyPartSelection>) => onChange({ ...selection, [active]: next });
  const toggleOpen = (key: string) => setOpen((prev) => { const s = new Set(prev); if (s.has(key)) s.delete(key); else s.add(key); return s; });
  const rootTasks = part.tasks.filter((t) => t.node_key === "");

  const renderTasks = (nodeKey: string, depth: number) =>
    part.tasks.filter((t) => t.node_key === nodeKey).sort((a, b) => a.sort_order - b.sort_order).map((t) => (
      <label key={t.key} style={{ paddingLeft: 28 + depth * 16 }} className="flex items-center gap-2 py-0.5 pr-2 text-xs text-muted-foreground hover:bg-muted/50">
        <TriCheckbox
          state={taskIncluded(sel, t) ? "on" : "off"}
          label={t.task_name}
          onChange={(on) => setSel(toggleTaskSelection(part, sel, t, on))}
        />
        <span className="truncate">{t.task_name}</span>
        {t.duration_days != null && <span className="ml-auto shrink-0 tabular-nums">{t.duration_days}d</span>}
      </label>
    ));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {parts.map((id) => {
          const p = getPart(doc, id)!;
          const c = countIn(p, selection[id] ?? emptyPartSelection(), null);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPartId(id)}
              className={cn("-mb-px border-b-2 px-3 py-1.5 text-xs font-medium",
                active === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {id === "sections" ? "Fixed sections" : `${FLOOR_BLOCK_LABELS[id]} block`}
              <span className={cn("ml-1", c.on < c.total ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{c.on}/{c.total}</span>
            </button>
          );
        })}
        <div className="ml-auto flex gap-2 pb-1 text-xs">
          <button type="button" className="text-primary hover:underline" onClick={() => setSel(emptyPartSelection())}>Select all</button>
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => {
              let next = emptyPartSelection();
              for (const { node } of ordered) if (node.parent_key === "" && !locked(node.key)) next = toggleNodeSelection(part, next, node.key, false);
              for (const t of rootTasks) next = toggleTaskSelection(part, next, t, false);
              // Locked path: untick what sits beside it.
              if (active === "sections" && doc.building_anchor_key) {
                for (const n of part.nodes) if (locked(n.parent_key) && n.parent_key !== "" && !locked(n.key)) next = toggleNodeSelection(part, next, n.key, false);
                for (const t of part.tasks) if (t.node_key && locked(t.node_key)) next = toggleTaskSelection(part, next, t, false);
              }
              setSel(next);
            }}
          >
            Clear all
          </button>
        </div>
      </div>

      {active !== "sections" && (
        <p className="text-xs text-muted-foreground">
          Applies to every {active === "typical" ? "level using the Typical block" : `${active} level`}: unticking a package here removes it from all those floors.
        </p>
      )}

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border py-1 text-sm">
        {rootTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-2 py-1">
              <button type="button" onClick={() => toggleOpen("")} className="text-muted-foreground" aria-label="Show activities">
                {open.has("") ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <span className="italic text-muted-foreground">Activities on the level itself</span>
              <span className="ml-auto text-xs text-muted-foreground">{countIn(part, sel, "").on}/{rootTasks.length}</span>
            </div>
            {open.has("") && renderTasks("", 0)}
          </div>
        )}
        {ordered.length === 0 && rootTasks.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">Nothing in this part.</p>}
        {ordered.map(({ node: n, depth }) => {
          const state = nodeCheckState(sel, n.key);
          const c = countIn(part, sel, n.key);
          const own = part.tasks.some((t) => t.node_key === n.key);
          const isLocked = locked(n.key);
          return (
            <div key={n.key}>
              <div style={{ paddingLeft: 8 + depth * 16 }} className={cn("flex items-center gap-2 py-1 pr-2 hover:bg-muted/50", state === "off" && "text-muted-foreground")}>
                <button
                  type="button"
                  onClick={() => toggleOpen(n.key)}
                  disabled={!own}
                  className="text-muted-foreground disabled:invisible"
                  aria-label="Show activities"
                >
                  {open.has(n.key) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <TriCheckbox
                  state={isLocked && state === "off" ? "partial" : state}
                  disabled={isLocked}
                  label={n.wbs_name}
                  onChange={(on) => setSel(toggleNodeSelection(part, sel, n.key, on))}
                />
                <span className="truncate"><span className="font-mono text-xs text-muted-foreground">{n.wbs_code}</span> {n.wbs_name}</span>
                {isLocked && <span title="Buildings are created here, so it stays in"><Lock className="h-3 w-3 text-muted-foreground" /></span>}
                <span className={cn("ml-auto shrink-0 text-xs tabular-nums", c.on < c.total ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                  {c.total ? `${c.on}/${c.total}` : ""}
                </span>
              </div>
              {open.has(n.key) && renderTasks(n.key, depth)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
