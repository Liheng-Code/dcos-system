export interface BimModel {
  id: string;
  tenant_id: string;
  project_id: string;
  model_name: string;
  discipline: string;
  revision: string;
  ifc_schema: string;
  file_url: string;
  file_size_mb: number;
  element_count: number;
  status: "CURRENT" | "SUPERSEDED" | "ARCHIVED";
  uploaded_by: string;
  created_at: string;
}

export interface BimElementWbsMap {
  id: string;
  tenant_id: string;
  model_id: string;
  global_id: string;
  wbs_node_id: string;
  mapped_by: string;
  created_at: string;
}

export interface BimViewpoint {
  id: string;
  tenant_id: string;
  model_id: string;
  name: string;
  camera_state: CameraState;
  visibility_state: VisibilityState;
  created_by: string;
  created_at: string;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  projection: "Perspective" | "Orthographic";
}

export interface VisibilityState {
  hiddenModelIds?: string[];
  hiddenItemIds?: Record<string, number[]>;
  sectionPlanes?: { normal: [number, number, number]; constant: number }[];
}

export interface SpatialTreeNode {
  id: string;
  name: string;
  type: "project" | "site" | "building" | "storey" | "type" | "element";
  expressId?: number;
  modelId?: string;
  children: SpatialTreeNode[];
  visible: boolean;
}

export interface LevelInfo {
  expressId: number;
  name: string;
  elevation: number;
  modelId: string;
  visible: boolean;
  elementCount: number;
}

export interface DisciplineInfo {
  name: string;
  label: string;
  ifcClasses: string[];
  visible: boolean;
  elementCount: number;
  modelId: string;
}

export interface ElementProperty {
  name: string;
  value: string;
  type?: string;
  unit?: string;
}

export interface PropertySet {
  name: string;
  properties: ElementProperty[];
}

export interface ElementProperties {
  globalId: string;
  ifcClass: string;
  name: string;
  tag?: string;
  objectType?: string;
  description?: string;
  location?: string;
  propertySets: PropertySet[];
  quantities: ElementProperty[];
  materials: { name: string; layers?: { name: string; thickness: number }[] }[];
  typeProperties?: PropertySet[];
}

export interface BimElementTakeoff {
  id: string;
  tenant_id: string;
  model_id: string;
  global_id: string;
  ifc_class?: string;
  building_name?: string;
  discipline?: string;
  building_code?: string;
  sequence?: string;
  building_level?: string;
  level?: string;
  section?: string;
  sub_section?: string;
  sub_element?: string;
  material_type?: string;
  element_type?: string;
  element_group?: string;
  element_id?: string;
  description?: string;
  unit?: string;
  quantity?: number | null;
  raw_properties: Record<string, unknown>;
  extracted_by: string;
  extracted_at: string;
}

// Exact-match: lowercased Revit/IFC property name -> BimElementTakeoff column.
export const BOQ_EXACT_FIELD_MAP: Record<string, keyof BimElementTakeoff> = {
  "building name": "building_name",
  "discipline": "discipline",
  "building code": "building_code",
  "sequence": "sequence",
  "reference level": "building_level",
  "boqlevel": "level",
  "section": "section",
  "type comments": "sub_section",
  "type": "element_type",
  "element id": "element_id",
  "description": "description",
  "unit_volume": "unit",
  "volume": "quantity",
};

// Prefix-match (case-insensitive startsWith) — handles per-material parameter
// families like SubElement_Concrete / SubElement_Steel without hardcoding each one.
export const BOQ_PREFIX_FIELD_MAP: Record<string, keyof BimElementTakeoff> = {
  "subelement_": "sub_element",
  "material_": "material_type",
  "elementgroup_": "element_group",
};

export interface IfcDisciplineMap {
  [key: string]: { label: string; ifcClasses: string[] };
}

export const DISCIPLINE_MAP: IfcDisciplineMap = {
  ARC: {
    label: "Architecture",
    ifcClasses: [
      "IFCWALL", "IFCWALLSTANDARDCASE", "IFCDOOR", "IFCWINDOW",
      "IFCCOVERING", "IFCFURNISHINGELEMENT", "IFCRAILING",
      "IFCSTAIR", "IFCSTAIRFLIGHT", "IFCPLATE", "IFCMEMBER",
      "IFCROW", "IFCCURTAINWALL", "IFCSHADINGDEVICE",
      "IFCSPACE", "IFCOPENINGELEMENT", "IFCBUILDINGELEMENTPROXY",
    ],
  },
  STR: {
    label: "Structure",
    ifcClasses: [
      "IFCCOLUMN", "IFCBEAM", "IFCSLAB", "IFCFOOTING", "IFCPILE",
      "IFCREINFORCINGBAR", "IFCREINFORCINGMESH", "IFCSTIRRUP",
      "IFCBEAMSTANDARDCASE", "IFCCOLUMNSTANDARDCASE",
      "IFCPILECAP", "IFCSLABELEMENTEDCASE",
    ],
  },
  MEP: {
    label: "MEP",
    ifcClasses: [
      "IFCFLOWSEGMENT", "IFCFLOWFITTING", "IFCFLOWTERMINAL",
      "IFCFLOWCONTROLLER", "IFCFLOWMOVINGDEVICE", "IFCFLOWSTORAGEDEVICE",
      "IFCFLOWTREATMENTDEVICE", "IFCENERGYCONVERSIONDEVICE",
      "IFCDUCTSEGMENT", "IFCPIPESSEGMENT", "IFCPIPEFITTING",
      "IFCCABLECARRIERSEGMENT", "IFCCABLESEGMENT",
      "IFCDISTRIBUTIONPORT", "IFCDISTRIBUTIONBOARD",
      "IFCSPACEHEATER", "IFCFAN", "IFCPUMP",
      "IFCCOMPRESSOR", "IFCCOOLINGTOWER",
    ],
  },
  CIVIL: {
    label: "Civil",
    ifcClasses: [
      "IFCROAD", "IFCBRIDGE", "IFCRAILWAY", "IFCTUNNEL",
      "IFCPILE", "IFCFOOTING",
    ],
  },
};

export const DISCIPLINE_COLORS: Record<string, string> = {
  ARC: "#6366f1",
  STR: "#f59e0b",
  MEP: "#10b981",
  CIVIL: "#8b5cf6",
  FED: "#6b7280",
};

export type ColorMode = "none" | "by-story" | "by-element";

export type ColorPalette = "tableau" | "pastel" | "neon" | "earth";

export interface ColorLegendEntry {
  name: string;
  color: string;
  count: number;
}

// Tableau-10-like palette for color-by-story, assigned by elevation order.
export const STORY_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
  "#86bcb6",
  "#8cd17d",
  "#b6992d",
  "#499894",
  "#e17264",
  "#d37295",
  "#fabfd2",
  "#af7aa1",
  "#f0ce16",
  "#bab0ac",
];

// Distinct palette for unmapped IFC classes in color-by-element mode.
export const ELEMENT_EXTRA_COLORS = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
  "#393b79",
  "#637939",
  "#8c6d31",
  "#843c39",
  "#7b4173",
];

export const COLOR_PALETTES: Record<ColorPalette, string[]> = {
  tableau: [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
    "#86bcb6", "#8cd17d", "#b6992d", "#499894", "#e17264",
  ],
  pastel: [
    "#a1c9f4", "#ffb482", "#ff9f9b", "#8de5a1", "#b6f286",
    "#f9c74f", "#c8b6ff", "#ff6392", "#d0bfff", "#bde0fe",
    "#caffbf", "#fdffb6", "#ffd6a5", "#bdb2ff", "#ffc6ff",
  ],
  neon: [
    "#00f5d4", "#f15bb5", "#fee440", "#00bbf9", "#9b5de5",
    "#ff6b6b", "#4ecdc4", "#45b7d1", "#f7dc6f", "#bb86fc",
    "#03dac6", "#cf6679", "#ffab40", "#69f0ae", "#e040fb",
  ],
  earth: [
    "#8b7355", "#a0522d", "#6b8e23", "#cd853f", "#2e8b57",
    "#b8860b", "#556b2f", "#d2691e", "#8fbc8f", "#daa520",
    "#3cb371", "#b22222", "#228b22", "#cc7722", "#006400",
  ],
};
