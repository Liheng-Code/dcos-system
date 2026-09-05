"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { type QsElementRow, type DescriptionRow, type BudgetCodeOption } from "@/lib/qs-element-library-shared";

interface ElementLibraryTreeProps {
  grouped: Map<string, Map<string, QsElementRow[]>>;
  isFiltering: boolean;
  expandedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  descriptions: DescriptionRow[];
  budgetCodes: BudgetCodeOption[];
  selectedId: string | null;
  onSelectItem: (item: QsElementRow) => void;
}

export default function ElementLibraryTree({
  grouped,
  isFiltering,
  expandedGroups,
  onToggleGroup,
  descriptions,
  budgetCodes,
  selectedId,
  onSelectItem,
}: ElementLibraryTreeProps) {
  function isExpanded(key: string) {
    return isFiltering || expandedGroups.has(key);
  }

  function budgetCodeLabel(id: string | null) {
    if (!id) return "— none —";
    const bc = budgetCodes.find((b) => b.id === id);
    return bc ? `${bc.code} — ${bc.description}` : "— none —";
  }

  function descriptionCount(elementId: string) {
    return descriptions.filter((d) => d.element_library_id === elementId).length;
  }

  return (
    <div className="space-y-4">
      {grouped.size === 0 && (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          No elements match the current filters.
        </div>
      )}

      {Array.from(grouped.entries()).map(([discipline, sectionMap]) => (
        <div key={discipline} className="space-y-2">
          <h3 className="px-1 text-sm font-semibold">{discipline}</h3>
          <div className="space-y-2">
            {Array.from(sectionMap.entries()).map(([section, rows]) => {
              const key = `${discipline}::${section}`;
              const expanded = isExpanded(key);
              return (
                <div key={key} className="rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onToggleGroup(key)}
                    className="flex w-full items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-left hover:bg-muted/70"
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span className="text-sm font-medium">{section}</span>
                    <span className="text-xs text-muted-foreground">({rows.length})</span>
                  </button>
                  {expanded && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30">
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Sub Section
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Sub Element
                          </th>
                          <th className="w-[70px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Unit
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Budget Code
                          </th>
                          <th className="w-[140px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Descriptions
                          </th>
                          <th className="w-[90px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Active
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const count = descriptionCount(r.id);
                          const selected = r.id === selectedId;
                          return (
                            <tr
                              key={r.id}
                              onClick={() => onSelectItem(r)}
                              className={`cursor-pointer border-t border-border transition-colors ${
                                selected ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-muted/30"
                              }`}
                            >
                              <td className="px-3 py-2 text-sm">{r.sub_section}</td>
                              <td className="px-3 py-2 text-sm">{r.sub_element}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{r.typical_unit ?? "—"}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[220px]" title={budgetCodeLabel(r.budget_code_id)}>
                                {budgetCodeLabel(r.budget_code_id)}
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  {count} description{count === 1 ? "" : "s"}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    r.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                                  }`}
                                >
                                  {r.is_active ? "Active" : "Inactive"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
