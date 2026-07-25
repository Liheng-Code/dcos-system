"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ListTree, Wrench, Users, Palette, AlertTriangle, Maximize2, Minimize2, ChevronsUpDown } from "lucide-react";
import { type CalculatedPrelimItem, type CalculatedPrelimTree } from "@/lib/prelim-library-service";
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from "@/components/ui/popover";

interface PrelimTreeProps {
  tree: CalculatedPrelimTree;
  onSelectItem?: (item: CalculatedPrelimItem) => void;
}

const CATEGORY_ICONS: Record<string, typeof Wrench> = {
  temporary_works: Wrench,
  staff: Users,
  design: Palette,
  risk: AlertTriangle,
};

const CATEGORY_LABELS: Record<string, string> = {
  temporary_works: "Temporary Works",
  staff: "Site Staff & Overheads",
  design: "Design Expenses",
  risk: "Risks & Opportunities",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function collectAllCodes(nodes: CalculatedPrelimItem[]): string[] {
  const codes: string[] = [];
  for (const node of nodes) {
    codes.push(node.code);
    if (node.children.length > 0) codes.push(...collectAllCodes(node.children));
  }
  return codes;
}

function TreeNode({
  node,
  depth,
  expandedSet,
  onToggle,
  onSelectItem,
}: {
  node: CalculatedPrelimItem;
  depth: number;
  expandedSet: Set<string>;
  onToggle: (code: string) => void;
  onSelectItem?: (item: CalculatedPrelimItem) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isLeaf = !hasChildren || node.children.every((c) => c.children.length === 0);
  const expanded = expandedSet.has(node.code);
  const Icon = CATEGORY_ICONS[node.category] ?? ListTree;

  return (
    <Fragment>
      <tr
        className={`hover:bg-muted/30 cursor-pointer transition-colors ${
          isLeaf ? "bg-muted/10" : ""
        }`}
        onClick={() => {
          if (hasChildren) onToggle(node.code);
          onSelectItem?.(node);
        }}
      >
        <td className="px-3 py-1.5" style={{ paddingLeft: `${depth * 20 + 12}px` }}>
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              expanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
          </div>
        </td>
        <td className="px-3 py-1.5 text-sm">{node.description}</td>
        <td className="px-3 py-1.5 text-xs text-muted-foreground text-right w-20">{node.unit}</td>
        <td className="px-3 py-1.5 text-sm text-right w-24 tabular-nums">{formatCurrency(node.quantity)}</td>
        <td className="px-3 py-1.5 text-sm text-right w-28 tabular-nums">{formatCurrency(node.rate)}</td>
        <td className={`px-3 py-1.5 text-sm text-right w-32 tabular-nums font-medium ${node.amount > 0 ? "" : "text-muted-foreground"}`}>
          {formatCurrency(node.amount)}
        </td>
      </tr>
      {expanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.code}
            node={child}
            depth={depth + 1}
            expandedSet={expandedSet}
            onToggle={onToggle}
            onSelectItem={onSelectItem}
          />
        ))}
    </Fragment>
  );
}

export default function PrelimTree({ tree, onSelectItem }: PrelimTreeProps) {
  const allCodes = useMemo(() => collectAllCodes(tree.sections), [tree.sections]);
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const code of allCodes) set.add(code);
    return set;
  });

  const allExpanded = allCodes.length > 0 && allCodes.every((c) => expandedSet.has(c));
  const noneExpanded = allCodes.every((c) => !expandedSet.has(c));

  useEffect(() => {
    setExpandedSet((prev) => {
      const next = new Set<string>();
      for (const code of allCodes) next.add(code);
      return next;
    });
  }, [allCodes]);

  const handleToggle = useCallback((code: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedSet(new Set(allCodes));
  }, [allCodes]);

  const handleCollapseAll = useCallback(() => {
    setExpandedSet(new Set());
  }, []);

  const expandedCount = expandedSet.size;
  const totalCount = allCodes.length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
        <h3 className="text-sm font-semibold">Calculated Preliminaries</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {tree.sections.length} sections
          </span>
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  <span>Expand All</span>
                  <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground tabular-nums">
                    {expandedCount}/{totalCount}
                  </span>
                </button>
              }
            />
            <PopoverContent side="bottom" align="end" sideOffset={6} className="w-64 p-0">
              <div className="p-3">
                <PopoverTitle className="flex items-center gap-2 text-sm">
                  <ListTree className="h-4 w-4 text-muted-foreground" />
                  Tree View Options
                </PopoverTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Control how the preliminary items tree is displayed.
                </p>
              </div>
              <div className="border-t border-border p-1">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  disabled={allExpanded}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 dark:bg-blue-900/30">
                    <Maximize2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Expand All</div>
                    <div className="text-xs text-muted-foreground">Show all {totalCount} items and sub-items</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  disabled={noneExpanded}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-orange-100 dark:bg-orange-900/30">
                    <Minimize2 className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Collapse All</div>
                    <div className="text-xs text-muted-foreground">Show only top-level sections</div>
                  </div>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Code</th>
            <th className="px-3 py-2 text-left font-medium">Description</th>
            <th className="px-3 py-2 text-right font-medium">Unit</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Rate ($)</th>
            <th className="px-3 py-2 text-right font-medium">Amount ($)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tree.sections.map((section) => (
            <TreeNode
              key={section.code}
              node={section}
              depth={0}
              expandedSet={expandedSet}
              onToggle={handleToggle}
              onSelectItem={onSelectItem}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/50 font-semibold">
            <td colSpan={5} className="px-3 py-2 text-sm text-right">
              TOTAL PRELIMINARIES
            </td>
            <td className="px-3 py-2 text-sm text-right tabular-nums">
              {formatCurrency(tree.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
