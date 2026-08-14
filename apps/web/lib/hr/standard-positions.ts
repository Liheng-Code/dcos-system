export interface StandardPosition {
  code: string;
  name: string;
  group: string;
}

export const STANDARD_POSITIONS: StandardPosition[] = [
  { code: "EXE-001", name: "Managing Director", group: "Executive" },
  { code: "EXE-002", name: "General Manager", group: "Executive" },
  { code: "MGR-001", name: "Project Manager", group: "Management" },
  { code: "MGR-002", name: "Architecture Manager", group: "Management" },
  { code: "MGR-003", name: "Structure Manager", group: "Management" },
  { code: "MGR-004", name: "MEP Manager", group: "Management" },
  { code: "MGR-005", name: "Procurement Manager", group: "Management" },
  { code: "MGR-006", name: "Site Manager", group: "Management" },
  { code: "MGR-007", name: "HR & Admin Manager", group: "Management" },
  { code: "MGR-008", name: "Account Manager", group: "Management" },
  { code: "MGR-009", name: "QS Manager", group: "Management" },
  { code: "SEN-001", name: "Senior Architecture Engineer", group: "Senior Level" },
  { code: "SEN-002", name: "Senior Structure Engineer", group: "Senior Level" },
  { code: "SEN-003", name: "Senior MEP Engineer", group: "Senior Level" },
  { code: "SEN-004", name: "Senior Procurement Officer", group: "Senior Level" },
  { code: "SEN-005", name: "Senior Site Engineer", group: "Senior Level" },
  { code: "SEN-006", name: "Senior HR & Admin Officer", group: "Senior Level" },
  { code: "SEN-007", name: "Senior Accountant", group: "Senior Level" },
  { code: "SEN-008", name: "Senior QS", group: "Senior Level" },
  { code: "ENG-001", name: "Architecture Engineer", group: "Engineer / Officer" },
  { code: "ENG-002", name: "Structure Engineer", group: "Engineer / Officer" },
  { code: "ENG-003", name: "MEP Engineer", group: "Engineer / Officer" },
  { code: "OFF-001", name: "Procurement Officer", group: "Engineer / Officer" },
  { code: "ENG-004", name: "Site Engineer", group: "Engineer / Officer" },
  { code: "ENG-005", name: "QS", group: "Engineer / Officer" },
  { code: "OFF-002", name: "HR & Admin Officer", group: "Engineer / Officer" },
  { code: "OFF-003", name: "Accountant", group: "Engineer / Officer" },
  { code: "OFF-004", name: "Project Coordinator", group: "Engineer / Officer" },
  { code: "TEC-001", name: "Technician", group: "Technical Staff" },
  { code: "TEC-002", name: "Foreman", group: "Technical Staff" },
  { code: "TEC-003", name: "Operator", group: "Technical Staff" },
  { code: "TEC-004", name: "Store Keeper", group: "Technical Staff" },
  { code: "TEC-005", name: "Driver", group: "Technical Staff" },
  { code: "TEC-006", name: "Cleaner", group: "Technical Staff" },
  { code: "TEC-007", name: "Security Guard", group: "Technical Staff" },
];

export const STANDARD_POSITION_GROUPS = Array.from(
  STANDARD_POSITIONS.reduce((groups, position) => {
    const existing = groups.get(position.group) ?? [];
    existing.push(position);
    groups.set(position.group, existing);
    return groups;
  }, new Map<string, StandardPosition[]>()),
  ([group, positions]) => ({ group, positions }),
);

export function isStandardPositionName(value: string | null | undefined) {
  return !!value && STANDARD_POSITIONS.some((position) => position.name === value);
}
