export interface LevelEntry {
  code: string;
  name: string;
}

export interface LevelNamingTemplateRecord {
  id: string;
  template_name: string;
  description: string | null;
  is_active: boolean;
  config: LevelEntry[];
}

export interface WbsConfigState {
  buildingCode: string;
  buildingName: string;
  levelEntries: LevelEntry[];
  designZones: string[];
  constructionZones: string[];
  startRoom: number;
  selectedTemplateId: string | null;
}

export interface GeneratedLevel {
  seq: number;
  code: string;
  label: string;
}

export function generateLevels(buildingCode: string, entries: LevelEntry[]): GeneratedLevel[] {
  return entries.map((entry, index) => ({
    seq: index + 1,
    code: `${buildingCode}-${String(index + 1).padStart(2, "0")}-${entry.code}`,
    label: entry.name,
  }));
}

export function generateZones(levels: GeneratedLevel[], designZones: string[], constructionZones: string[]): { levelCode: string; zoneCode: string }[] {
  const zones: { levelCode: string; zoneCode: string }[] = [];
  for (const level of levels) {
    for (const dz of designZones) {
      zones.push({ levelCode: level.code, zoneCode: `${level.code}-${dz}` });
    }
    for (const cz of constructionZones) {
      zones.push({ levelCode: level.code, zoneCode: `${level.code}-${cz}` });
    }
  }
  return zones;
}

export function generateRooms(levels: GeneratedLevel[], startRoom: number, config: WbsConfigState): string[] {
  const rooms: string[] = [];
  for (const level of levels) {
    const seqStr = String(level.seq).padStart(2, "0");
    for (let i = 0; i < 5; i++) {
      const r = startRoom + i;
      rooms.push(`${config.buildingCode}.${seqStr}.${level.code.split("-")[2]}-R${String(r).padStart(3, "0")}`);
    }
  }
  return rooms;
}

const ROOMS_PER_LEVEL = 5;

export interface WbsNodeInsertPayload {
  project_id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string;
  wbs_name: string;
  sort_order: number;
  status: string;
}

export function buildWbsInsertPayloads(
  projectId: string,
  wbsConfig: WbsConfigState,
  levels: GeneratedLevel[],
  zones: { levelCode: string; zoneCode: string }[],
  rooms: string[],
): {
  building: WbsNodeInsertPayload;
  levels: { payload: WbsNodeInsertPayload; levelCode: string }[];
  zonesByLevel: Record<string, WbsNodeInsertPayload[]>;
  roomsByLevel: Record<string, WbsNodeInsertPayload[]>;
} {
  const building: WbsNodeInsertPayload = {
    project_id: projectId,
    parent_id: null,
    node_type: "building",
    wbs_code: wbsConfig.buildingCode,
    wbs_name: wbsConfig.buildingName || wbsConfig.buildingCode,
    sort_order: 0,
    status: "active",
  };

  const levelItems = levels.map((l) => ({
    payload: {
      project_id: projectId,
      parent_id: null,
      node_type: "level",
      wbs_code: l.code,
      wbs_name: l.label,
      sort_order: l.seq,
      status: "active",
    },
    levelCode: l.code,
  }));

  const zonesByLevel: Record<string, WbsNodeInsertPayload[]> = {};
  for (const z of zones) {
    if (!zonesByLevel[z.levelCode]) zonesByLevel[z.levelCode] = [];
    zonesByLevel[z.levelCode].push({
      project_id: projectId,
      parent_id: null,
      node_type: "zone",
      wbs_code: z.zoneCode,
      wbs_name: z.zoneCode,
      sort_order: zonesByLevel[z.levelCode].length,
      status: "active",
    });
  }

  const roomsByLevel: Record<string, WbsNodeInsertPayload[]> = {};
  for (let i = 0; i < levels.length; i++) {
    const lc = levels[i].code;
    const chunk = rooms.slice(i * ROOMS_PER_LEVEL, (i + 1) * ROOMS_PER_LEVEL);
    roomsByLevel[lc] = chunk.map((r, idx) => ({
      project_id: projectId,
      parent_id: null,
      node_type: "room",
      wbs_code: r,
      wbs_name: r,
      sort_order: idx,
      status: "active",
    }));
  }

  return { building, levels: levelItems, zonesByLevel, roomsByLevel };
}
