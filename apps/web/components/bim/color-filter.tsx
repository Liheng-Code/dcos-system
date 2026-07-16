"use client";

import { useState } from "react";
import { useBimViewer } from "@/hooks/use-bim-viewer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Palette } from "lucide-react";
import type { ColorMode, ColorPalette } from "@/lib/bim/bim-types";
import { COLOR_PALETTES } from "@/lib/bim/bim-types";

const COLOR_MODE_OPTIONS: { value: ColorMode; label: string }[] = [
  { value: "none", label: "No Coloring" },
  { value: "by-story", label: "Color by Story (Level)" },
  { value: "by-element", label: "Color by Element Type" },
];

const PALETTE_OPTIONS: { value: ColorPalette; label: string }[] = [
  { value: "tableau", label: "Tableau (Balanced)" },
  { value: "pastel", label: "Pastel (Soft)" },
  { value: "neon", label: "Neon (Vibrant)" },
  { value: "earth", label: "Earth (Natural)" },
];

export function ColorFilter() {
  const { colorMode, setColorMode, colorPalette, setColorPalette, colorLegend } = useBimViewer();
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-sm font-semibold text-gray-200 hover:text-white"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Palette className="h-4 w-4" />
        Color Filter
      </button>
      {expanded && (
        <div className="mt-2 ml-2 space-y-2">
          <Select
            value={colorMode}
            onValueChange={(v) => { if (v) setColorMode(v as ColorMode); }}
          >
            <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              {COLOR_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs text-gray-300">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {colorMode !== "none" && (
            <Select
              value={colorPalette}
              onValueChange={(v) => { if (v) setColorPalette(v as ColorPalette); }}
            >
              <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-gray-300">
                <SelectValue placeholder="Color palette" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {PALETTE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <span className="flex shrink-0">
                        {COLOR_PALETTES[opt.value].slice(0, 5).map((c, i) => (
                          <span
                            key={i}
                            className="h-2 w-2 rounded-full -ml-0.5 first:ml-0"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </span>
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {colorMode !== "none" && colorLegend.length > 0 && (
            <div className="max-h-56 overflow-y-auto space-y-0.5 text-xs pr-1">
              {colorLegend.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-gray-700/50"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate text-gray-300 flex-1" title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="text-gray-500 tabular-nums">
                    {entry.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
