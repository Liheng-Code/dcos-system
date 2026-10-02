"use client";

import { create } from "zustand";
import type { LevelInfo, DisciplineInfo, SpatialTreeNode, ElementProperties, ColorMode, ColorLegendEntry, ColorPalette } from "@/lib/design/bim/bim-types";

export type ActiveTool =
  | "orbit"
  | "pan"
  | "select"
  | "walkthrough"
  | "section-plane"
  | "section-box"
  | "measure"
  | "isolate"
  | "hide"
  | null;

export interface BimViewerState {
  // Model info
  modelId: string | null;
  modelName: string;
  revision: string;
  elementCount: number;
  ifcSchema: string;

  // Loading
  loadingProgress: number;
  isLoading: boolean;

  // Selection
  selectedItems: Map<string, number[]>;
  selectedTreeId: string | null;
  hoveredItem: { modelId: string; expressId: number } | null;
  elementProperties: ElementProperties | null;

  // Visibility
  levels: LevelInfo[];
  disciplines: DisciplineInfo[];
  spatialTree: SpatialTreeNode[];
  hiddenByLevel: Set<string>;
  hiddenByDiscipline: Set<string>;
  hiddenItems: Map<string, number[]>;
  // discipline code -> modelId -> localIds, built once at load time so the
  // Disciplines panel checkbox can hide/show elements instantly without
  // re-querying every item's IFC class on each toggle.
  disciplineElementIds: Map<string, Map<string, number[]>>;
  isolatedModelId: string | null;
  ghostMode: boolean;

  // Tools
  activeTool: ActiveTool;
  projectionMode: "Perspective" | "Orthographic";

  // Camera
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];

  // Settings
  backgroundColor: string;
  showShadows: boolean;
  showGrid: boolean;
  selectionColor: string;

  // Color mode
  colorMode: ColorMode;
  colorPalette: ColorPalette;
  colorLegend: ColorLegendEntry[];
  // modelId -> localId -> category name, built at load time
  elementStoryMap: Map<string, Map<number, string>>;
  elementClassMap: Map<string, Map<number, string>>;

  // Actions
  setModelInfo: (info: { modelId: string; modelName: string; revision: string; ifcSchema: string }) => void;
  setElementCount: (count: number) => void;
  setLoadingProgress: (progress: number) => void;
  setIsLoading: (loading: boolean) => void;
  setSelectedItems: (items: Map<string, number[]>) => void;
  setSelectedTreeId: (id: string | null) => void;
  setHoveredItem: (item: { modelId: string; expressId: number } | null) => void;
  setElementProperties: (props: ElementProperties | null) => void;
  setLevels: (levels: LevelInfo[]) => void;
  setDisciplines: (disciplines: DisciplineInfo[]) => void;
  setSpatialTree: (tree: SpatialTreeNode[]) => void;
  toggleLevel: (levelName: string) => void;
  toggleDiscipline: (disciplineCode: string) => void;
  setIsolatedModelId: (id: string | null) => void;
  setHiddenItems: (items: Map<string, number[]>) => void;
  setDisciplineElementIds: (ids: Map<string, Map<string, number[]>>) => void;
  toggleItemVisibility: (modelId: string, localIds: number[]) => void;
  setGhostMode: (ghost: boolean) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setProjectionMode: (mode: "Perspective" | "Orthographic") => void;
  setCameraPosition: (pos: [number, number, number]) => void;
  setCameraTarget: (target: [number, number, number]) => void;
  setBackgroundColor: (color: string) => void;
  setShowShadows: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setSelectionColor: (color: string) => void;
  setColorMode: (mode: ColorMode) => void;
  setColorPalette: (palette: ColorPalette) => void;
  setColorLegend: (legend: ColorLegendEntry[]) => void;
  setElementStoryMap: (map: Map<string, Map<number, string>>) => void;
  setElementClassMap: (map: Map<string, Map<number, string>>) => void;
  reset: () => void;
}

const initialState = {
  modelId: null,
  modelName: "",
  revision: "",
  elementCount: 0,
  ifcSchema: "IFC4",
  loadingProgress: 0,
  isLoading: true,
  selectedItems: new Map<string, number[]>(),
  selectedTreeId: null,
  hoveredItem: null,
  elementProperties: null,
  levels: [],
  disciplines: [],
  spatialTree: [],
  hiddenByLevel: new Set<string>(),
  hiddenByDiscipline: new Set<string>(),
  hiddenItems: new Map<string, number[]>(),
  disciplineElementIds: new Map<string, Map<string, number[]>>(),
  isolatedModelId: null,
  ghostMode: false,
  activeTool: "orbit" as ActiveTool,
  projectionMode: "Perspective" as const,
  cameraPosition: [10, 10, 10] as [number, number, number],
  cameraTarget: [0, 0, 0] as [number, number, number],
  backgroundColor: "#1a1a2e",
  showShadows: false,
  showGrid: true,
  selectionColor: "#6366f1",
  colorMode: "none" as ColorMode,
  colorPalette: "tableau" as ColorPalette,
  colorLegend: [],
  elementStoryMap: new Map<string, Map<number, string>>(),
  elementClassMap: new Map<string, Map<number, string>>(),
};

export const useBimViewer = create<BimViewerState>((set) => ({
  ...initialState,

  setModelInfo: (info) => set(info),
  setElementCount: (count) => set({ elementCount: count }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setSelectedItems: (items) => set({ selectedItems: items }),
  setSelectedTreeId: (id) => set({ selectedTreeId: id }),
  setHoveredItem: (item) => set({ hoveredItem: item }),
  setElementProperties: (props) => set({ elementProperties: props }),
  setLevels: (levels) => set({ levels }),
  setDisciplines: (disciplines) => set({ disciplines }),
  setSpatialTree: (tree) => set({ spatialTree: tree }),

  toggleLevel: (levelName) =>
    set((state) => {
      const next = new Set(state.hiddenByLevel);
      if (next.has(levelName)) next.delete(levelName);
      else next.add(levelName);
      return { hiddenByLevel: next };
    }),

  toggleDiscipline: (disciplineCode) =>
    set((state) => {
      const next = new Set(state.hiddenByDiscipline);
      if (next.has(disciplineCode)) next.delete(disciplineCode);
      else next.add(disciplineCode);
      return { hiddenByDiscipline: next };
    }),

  setIsolatedModelId: (id) => set({ isolatedModelId: id }),
  setHiddenItems: (items) => set({ hiddenItems: items }),
  setDisciplineElementIds: (ids) => set({ disciplineElementIds: ids }),
  toggleItemVisibility: (modelId, localIds) =>
    set((state) => {
      const next = new Map(state.hiddenItems);
      const ids = new Set(next.get(modelId) ?? []);
      for (const id of localIds) {
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
      }
      next.set(modelId, [...ids]);
      return { hiddenItems: next };
    }),
  setGhostMode: (ghost) => set({ ghostMode: ghost }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setProjectionMode: (mode) => set({ projectionMode: mode }),
  setCameraPosition: (pos) => set({ cameraPosition: pos }),
  setCameraTarget: (target) => set({ cameraTarget: target }),
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  setShowShadows: (show) => set({ showShadows: show }),
  setShowGrid: (show) => set({ showGrid: show }),
  setSelectionColor: (color) => set({ selectionColor: color }),
  setColorMode: (mode) => set({ colorMode: mode }),
  setColorPalette: (palette) => set({ colorPalette: palette }),
  setColorLegend: (legend) => set({ colorLegend: legend }),
  setElementStoryMap: (map) => set({ elementStoryMap: map }),
  setElementClassMap: (map) => set({ elementClassMap: map }),
  reset: () => set(initialState),
}));

// FPS updates once per animation frame (~60/s). Kept out of useBimViewer, whose
// consumers subscribe to the whole state object without a selector — merging fps
// into that store made every BIM panel/toolbar re-render 60 times a second, which
// was severe enough that buttons stopped registering clicks (their DOM nodes kept
// getting torn down and rebuilt mid-click). Only BimStatusBar reads this one.
interface BimFpsState {
  fps: number;
  setFps: (fps: number) => void;
}

export const useBimFps = create<BimFpsState>((set) => ({
  fps: 0,
  setFps: (fps) => set({ fps }),
}));
