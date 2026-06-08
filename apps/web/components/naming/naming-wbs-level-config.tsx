"use client";

import { Layers } from "lucide-react";
import { Label } from "@/components/ui/label";
import { NamingLevelListEditor } from "./naming-level-list-editor";
import { generateLevels } from "./naming-wbs-types";
import type { LevelEntry, LevelNamingTemplateRecord } from "./naming-wbs-types";

interface WbsLevelConfigProps {
  buildingCode: string;
  levelEntries: LevelEntry[];
  templates: LevelNamingTemplateRecord[];
  selectedTemplateId: string | null;
  onLevelEntriesChange: (entries: LevelEntry[]) => void;
  onTemplateChange: (templateId: string | null) => void;
}

export function WbsLevelConfig({
  buildingCode,
  levelEntries,
  templates,
  selectedTemplateId,
  onLevelEntriesChange,
  onTemplateChange,
}: WbsLevelConfigProps) {
  const generated = buildingCode ? generateLevels(buildingCode, levelEntries) : [];

  return (
    <div className="rounded-xl border bg-white p-4 space-y-4">
      <details open>
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium list-none [&::-webkit-details-marker]:hidden">
          <Layers className="h-4 w-4 text-primary" />
          Level Configuration
        </summary>
        <div className="mt-4 space-y-4">
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label>Naming Template</Label>
              <select
                value={selectedTemplateId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  onTemplateChange(id);
                  if (id) {
                    const tpl = templates.find((t) => t.id === id);
                    if (tpl) onLevelEntriesChange(tpl.config);
                  }
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
              >
                <option value="">— No Template (manual) —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.template_name}</option>
                ))}
              </select>
            </div>
          )}
          <NamingLevelListEditor
            entries={levelEntries}
            onChange={onLevelEntriesChange}
          />
          {generated.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Generated WBS level codes ({generated.length} levels):
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {generated.map((l) => (
                  <span
                    key={l.code}
                    className="inline-flex items-center rounded-md border border-border bg-muted/30 px-2 py-1 text-xs font-mono"
                  >
                    {l.code}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
