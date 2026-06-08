"use client";

import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { LevelEntry } from "./naming-wbs-types";

interface NamingLevelListEditorProps {
  entries: LevelEntry[];
  onChange: (entries: LevelEntry[]) => void;
}

export function NamingLevelListEditor({ entries, onChange }: NamingLevelListEditorProps) {
  function updateEntry(index: number, field: keyof LevelEntry, value: string) {
    const next = entries.map((e, i) => (i === index ? { ...e, [field]: value } : e));
    onChange(next);
  }

  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  function moveEntry(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addEntry() {
    onChange([...entries, { code: "", name: "" }]);
  }

  return (
    <div className="space-y-2">
      <Label>Levels</Label>
      <div className="space-y-1.5">
        {entries.map((entry, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => moveEntry(index, -1)}
                disabled={index === 0}
                className="h-3.5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => moveEntry(index, 1)}
                disabled={index === entries.length - 1}
                className="h-3.5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <input
              value={entry.code}
              onChange={(e) => updateEntry(index, "code", e.target.value)}
              placeholder="Code"
              className="w-24 rounded border border-border bg-background px-2 py-1.5 text-xs font-mono outline-hidden focus:border-primary"
            />
            <input
              value={entry.name}
              onChange={(e) => updateEntry(index, "name", e.target.value)}
              placeholder="Level Name"
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs outline-hidden focus:border-primary"
            />
            <button
              type="button"
              onClick={() => removeEntry(index)}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addEntry}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Create Level
      </Button>
    </div>
  );
}
