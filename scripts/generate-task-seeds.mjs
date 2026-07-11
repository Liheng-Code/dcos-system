import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");
const OUTPUT_DIR = join(__dirname, "..", "supabase", "migrations");

// ====================================================================
// Complete prefix → task group mapping (across all 5 disciplines)
// ====================================================================
const PREFIX_MAP = {
  // ── Architecture ──
  "ARC-D":    { groupCode: "ARC-DESDEV",    groupName: "Design Development",          category: "Design",        discCode: "ARC" },
  "ARC-C":    { groupCode: "ARC-CALC",      groupName: "Calculation & Compliance",     category: "Design",        discCode: "ARC" },
  "ARC-S":    { groupCode: "ARC-SPEC",      groupName: "Specification",                category: "Design",        discCode: "ARC" },
  "ARC-DR":   { groupCode: "ARC-DRAW",      groupName: "Drawing Production",           category: "Design",        discCode: "ARC" },
  "ARC-SD":   { groupCode: "ARC-SHOP",      groupName: "Shop Drawing Review",          category: "Design",        discCode: "ARC" },
  "ARC-MAR":  { groupCode: "ARC-MAR",       groupName: "Material Approval (MAR)",      category: "Procurement",   discCode: "ARC" },
  "ARC-MS":   { groupCode: "ARC-METHOD",    groupName: "Method Statement Review",      category: "Construction",  discCode: "ARC" },
  "ARC-RFI":  { groupCode: "ARC-RFI",       groupName: "RFI Management",               category: "Design",        discCode: "ARC" },
  "ARC-BIM":  { groupCode: "ARC-BIM",       groupName: "BIM Coordination",             category: "Design",        discCode: "ARC" },
  "ARC-QS":   { groupCode: "ARC-QS",        groupName: "Quantity Support",             category: "Design",        discCode: "ARC" },
  "ARC-CS":   { groupCode: "ARC-CS",        groupName: "Construction Support",         category: "Construction",  discCode: "ARC" },
  "ARC-INSP": { groupCode: "ARC-INSP",      groupName: "Site Inspection",              category: "QAQC",          discCode: "ARC" },
  "ARC-AB":   { groupCode: "ARC-ASB",       groupName: "As-built Drawing",             category: "Handover",      discCode: "ARC" },
  "ARC-HD":   { groupCode: "ARC-HANDOVER",  groupName: "Handover Documentation",       category: "Handover",      discCode: "ARC" },

  // ── Structure ──
  "STR-DB":   { groupCode: "STR-DESBAS",    groupName: "Design Basis & Planning",       category: "Design",        discCode: "STR" },
  "STR-AN":   { groupCode: "STR-ANAL",      groupName: "Structural Analysis & Calculation", category: "Design",      discCode: "STR" },
  "STR-FD":   { groupCode: "STR-FND",       groupName: "Foundation Design",             category: "Design",        discCode: "STR" },
  "STR-SD":   { groupCode: "STR-SUPER",     groupName: "Superstructure Design",         category: "Design",        discCode: "STR" },
  "STR-DR":   { groupCode: "STR-DRAW",      groupName: "Drawing Production",           category: "Design",        discCode: "STR" },
  "STR-SH":   { groupCode: "STR-SHOP",      groupName: "Shop Drawing Review",           category: "Design",        discCode: "STR" },
  "STR-MAR":  { groupCode: "STR-MAR",       groupName: "Material Approval Review (MAR)", category: "Procurement",  discCode: "STR" },
  "STR-MS":   { groupCode: "STR-METHOD",    groupName: "Method Statement Review",       category: "Construction",  discCode: "STR" },
  "STR-BIM":  { groupCode: "STR-BIM",       groupName: "BIM Coordination",             category: "Design",        discCode: "STR" },
  "STR-QS":   { groupCode: "STR-QS",        groupName: "Quantity & BOQ Support",        category: "Design",        discCode: "STR" },
  "STR-RFI":  { groupCode: "STR-RFI",       groupName: "RFI Management",               category: "Design",        discCode: "STR" },
  "STR-CS":   { groupCode: "STR-CS",        groupName: "Construction Technical Support", category: "Construction", discCode: "STR" },
  "STR-INSP": { groupCode: "STR-INSP",      groupName: "Site Inspection",              category: "QAQC",          discCode: "STR" },
  "STR-AB":   { groupCode: "STR-ASB",       groupName: "As-built Drawing",             category: "Handover",      discCode: "STR" },
  "STR-HD":   { groupCode: "STR-HANDOVER",  groupName: "Handover Documentation",       category: "Handover",      discCode: "STR" },

  // ── MEP ──
  "MEP-D":    { groupCode: "MEP-DESDEV",    groupName: "Design Development",           category: "Design",        discCode: "MEP" },
  "MEP-C":    { groupCode: "MEP-CALC",      groupName: "Engineering Calculation",       category: "Design",        discCode: "MEP" },
  "MEP-EQ":   { groupCode: "MEP-EQ",        groupName: "Equipment Schedule",            category: "Design",        discCode: "MEP" },
  "MEP-DR":   { groupCode: "MEP-DRAW",      groupName: "Drawing Production",           category: "Design",        discCode: "MEP" },
  "MEP-SD":   { groupCode: "MEP-SHOP",      groupName: "Shop Drawing Review",           category: "Design",        discCode: "MEP" },
  "MEP-MAR":  { groupCode: "MEP-MAR",       groupName: "Material Approval (MAR)",       category: "Procurement",   discCode: "MEP" },
  "MEP-MS":   { groupCode: "MEP-METHOD",    groupName: "Method Statement Review",       category: "Construction",  discCode: "MEP" },
  "MEP-BIM":  { groupCode: "MEP-BIM",       groupName: "BIM Coordination",             category: "Design",        discCode: "MEP" },
  "MEP-QS":   { groupCode: "MEP-QS",        groupName: "Quantity & BOQ Support",        category: "Design",        discCode: "MEP" },
  "MEP-RFI":  { groupCode: "MEP-RFI",       groupName: "RFI Management",               category: "Design",        discCode: "MEP" },
  "MEP-CS":   { groupCode: "MEP-CS",        groupName: "Construction Technical Support", category: "Construction", discCode: "MEP" },
  "MEP-INSP": { groupCode: "MEP-INSP",      groupName: "Site Inspection",              category: "QAQC",          discCode: "MEP" },
  "MEP-TC":   { groupCode: "MEP-TC",        groupName: "Testing & Commissioning",       category: "Commissioning", discCode: "MEP" },
  "MEP-AB":   { groupCode: "MEP-ASB",       groupName: "As-built Drawing",             category: "Handover",      discCode: "MEP" },
  "MEP-HD":   { groupCode: "MEP-HANDOVER",  groupName: "Handover Documentation",       category: "Handover",      discCode: "MEP" },

  // ── Procurement ──
  "PROC-PL":  { groupCode: "PROC-PLAN",     groupName: "Procurement Planning",          category: "Procurement",   discCode: "PRC" },
  "PROC-MR":  { groupCode: "PROC-MR",       groupName: "Material Request (MR)",         category: "Procurement",   discCode: "PRC" },
  "PROC-PR":  { groupCode: "PROC-PR",       groupName: "Purchase Requisition (PR)",     category: "Procurement",   discCode: "PRC" },
  "PROC-RFQ": { groupCode: "PROC-RFQ",      groupName: "RFQ / Tendering",              category: "Procurement",   discCode: "PRC" },
  "PROC-TE":  { groupCode: "PROC-TECHEVAL", groupName: "Technical Evaluation",          category: "Procurement",   discCode: "PRC" },
  "PROC-CE":  { groupCode: "PROC-COMEVAL",  groupName: "Commercial Evaluation",         category: "Procurement",   discCode: "PRC" },
  "PROC-SN":  { groupCode: "PROC-NEG",      groupName: "Supplier Negotiation",          category: "Procurement",   discCode: "PRC" },
  "PROC-PO":  { groupCode: "PROC-PO",       groupName: "Purchase Order (PO)",           category: "Procurement",   discCode: "PRC" },
  "PROC-MF":  { groupCode: "PROC-MFG",      groupName: "Manufacturing Monitoring",      category: "Procurement",   discCode: "PRC" },
  "PROC-LG":  { groupCode: "PROC-LOG",      groupName: "Logistics & Delivery",          category: "Procurement",   discCode: "PRC" },
  "PROC-GRN": { groupCode: "PROC-GRN",      groupName: "Material Receiving (GRN)",      category: "Procurement",   discCode: "PRC" },
  "PROC-IV":  { groupCode: "PROC-INV",      groupName: "Invoice & Payment",            category: "Procurement",   discCode: "PRC" },
  "PROC-SP":  { groupCode: "PROC-SUPPERF",  groupName: "Supplier Performance",          category: "Procurement",   discCode: "PRC" },
  "PROC-CC":  { groupCode: "PROC-CLOSEOUT", groupName: "Contract Closeout",            category: "Procurement",   discCode: "PRC" },
  "PROC-RP":  { groupCode: "PROC-RPT",      groupName: "Procurement Reporting",         category: "Procurement",   discCode: "PRC" },

  // ── Construction ──
  "CON-SP":   { groupCode: "CON-SITEPREP",  groupName: "Site Preparation",              category: "Construction",  discCode: "CON" },
  "CON-SV":   { groupCode: "CON-SURV",      groupName: "Survey & Setting Out",          category: "Construction",  discCode: "CON" },
  "CON-TW":   { groupCode: "CON-TEMPWORKS", groupName: "Temporary Works",              category: "Construction",  discCode: "CON" },
  "CON-EW":   { groupCode: "CON-EARTH",     groupName: "Earthwork & Excavation",       category: "Construction",  discCode: "CON" },
  "CON-FD":   { groupCode: "CON-FND",       groupName: "Foundation Construction",       category: "Construction",  discCode: "CON" },
  "CON-ST":   { groupCode: "CON-STRUCT",    groupName: "Structural Construction",       category: "Construction",  discCode: "CON" },
  "CON-AR":   { groupCode: "CON-ARCH",      groupName: "Architectural Construction",    category: "Construction",  discCode: "CON" },
  "CON-MEP":  { groupCode: "CON-MEPINS",    groupName: "MEP Installation",             category: "Construction",  discCode: "CON" },
  "CON-DM":   { groupCode: "CON-SITEMGT",   groupName: "Daily Site Management",         category: "Construction",  discCode: "CON" },
  "CON-QA":   { groupCode: "CON-QAQC",      groupName: "QAQC & Inspection",            category: "QAQC",          discCode: "CON" },
  "CON-HSE":  { groupCode: "CON-HSE",       groupName: "HSE Coordination",             category: "HSE",           discCode: "CON" },
  "CON-PG":   { groupCode: "CON-PROGRESS",  groupName: "Progress Monitoring",           category: "Construction",  discCode: "CON" },
  "CON-PL":   { groupCode: "CON-PUNCH",     groupName: "Snag & Punch List",            category: "Handover",      discCode: "CON" },
  "CON-PC":   { groupCode: "CON-CLOSEOUT",  groupName: "Project Closeout",             category: "Handover",      discCode: "CON" },
  "CON-HD":   { groupCode: "CON-HANDOVER",  groupName: "Handover Support",             category: "Handover",      discCode: "CON" },
};
// Sort by key length descending so longer prefixes match before shorter ones
const SORTED_PREFIXES = Object.keys(PREFIX_MAP).sort((a, b) => b.length - a.length);

// ====================================================================
// Helper: extract code prefix from task code
// ====================================================================
function codePrefix(code) {
  // e.g., "ARC-D-001" → "ARC-D", "PROC-PL-010" → "PROC-PL", "CON-MEP-001" → "CON-MEP"
  const parts = code.split("-");
  parts.pop(); // remove numeric portion
  return parts.join("-");
}

// ====================================================================
// Helper: parse task table from lines starting at index i (header line)
// ====================================================================
function parseTaskTable(lines, i) {
  // Skip the separator line (after the | Code | Task | header)
  let j = i + 1;
  while (j < lines.length && lines[j].includes("---")) j++;

  const rows = [];
  for (let k = j; k < lines.length; k++) {
    const line = lines[k].trim();
    if (!line.startsWith("|")) break;
    const cells = line.split("|").filter(c => c.trim()).map(c => c.trim());
    if (cells.length >= 2 && cells[0] !== "Code" && cells[0] !== "Code") {
      rows.push({ code: cells[0], name: cells[1] });
    }
  }
  return rows;
}

// ====================================================================
// Parse all 5 design documents
// ====================================================================
const FILES = [
  { file: "# DCOS Architecture Task Group & Tasks.md" },
  { file: "# DCOS Structure Task Group & Task.md" },
  { file: "# DCOS MEP Task Group & Task.md" },
  { file: "# DCOS Procurement Task Group & Task.md" },
  { file: "# DCOS Construction Task Group & Task.md" },
];

const groups = [];     // accumulated unique task groups
const templates = [];  // accumulated task templates
const seenGroups = new Set();
const seenTemplates = new Set();

for (const { file } of FILES) {
  const filePath = join(DOCS_DIR, file);
  if (!existsSync(filePath)) {
    console.warn(`Skipping missing file: ${file}`);
    continue;
  }
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect table header: "| Code" or "| Code" (with possible spaces)
    if (line.match(/^\|\s*Code\b/)) {
      const rows = parseTaskTable(lines, i);
      if (rows.length === 0) continue;

      // Use the first row to determine the group
      const firstRow = rows[0];
      const prefix = codePrefix(firstRow.code);
      const meta = PREFIX_MAP[prefix];

      if (!meta) {
        console.warn(`Unknown prefix "${prefix}" for code "${firstRow.code}" in ${file}`);
        continue;
      }

      // Add task group if new
      if (!seenGroups.has(meta.groupCode)) {
        seenGroups.add(meta.groupCode);
        groups.push({
          code: meta.groupCode,
          name: meta.groupName,
          category: meta.category,
          description: `${meta.discCode} - ${meta.groupName} tasks.`,
          discCode: meta.discCode,
        });
      }

      // Add tasks
      for (const row of rows) {
        if (!seenTemplates.has(row.code)) {
          seenTemplates.add(row.code);
          templates.push({
            code: row.code,
            name: row.name,
            templateCode: row.code,
            category: meta.category === "Design" ? "Design Tasks"
                     : meta.category === "QAQC" ? "QAQC Tasks"
                     : meta.category === "HSE" ? "HSE Tasks"
                     : meta.category === "Handover" ? "Handover Tasks"
                     : meta.category === "Commissioning" ? "Commissioning Tasks"
                     : meta.category === "Construction" ? "Construction Tasks"
                     : meta.category === "Procurement" ? "Procurement Tasks"
                     : "Other Tasks",
            discCode: meta.discCode,
            taskGroupCode: meta.groupCode,
          });
        }
      }

      // Skip past the table rows (we already consumed them)
      i += rows.length + 2;
    }
  }
}

// ====================================================================
// Generate Task Groups SQL (migration 21)
// ====================================================================
function groupsSQL() {
  const rows = groups.map(g => {
    const name = g.name.replace(/'/g, "''");
    const cat = g.category.replace(/'/g, "''");
    const desc = g.description.replace(/'/g, "''");
    return `  ('${g.code}', '${name}', '${cat}', '${desc}')`;
  }).join(",\n");

  return `-- ============================================================
-- Migration 21: Extended Task Groups (discipline-specific)
-- Adds per-discipline workflow groups alongside existing generic groups.
-- ============================================================

insert into public.task_group_master (task_group_code, task_group_name, category, description) values
${rows}
on conflict (task_group_code) do update set
  task_group_name = excluded.task_group_name,
  category = excluded.category,
  description = excluded.description;
`;
}

// ====================================================================
// Generate Task Templates SQL (migration 22)
// ====================================================================
function templatesSQL() {
  // Build sorted unique groups to avoid duplicates
  const groupKeys = [...new Set(templates.map(t => t.taskGroupCode))];
  const discCodes = [...new Set(templates.map(t => t.discCode))];
  const catCodes = [...new Set(templates.map(t => t.category))];

  const rows = templates.map(t => {
    const name = t.name.replace(/'/g, "''");
    const cat = t.category.replace(/'/g, "''");
    return `  ('${t.code}', '${name}', '${cat}', (select id from public.discipline_master where discipline_code = '${t.discCode}'), (select id from public.task_group_master where task_group_code = '${t.taskGroupCode}'), 1, 'medium', true)`;
  }).join(",\n");

  return `-- ============================================================
-- Migration 22: Extended Task Templates
-- Seeds all discipline-specific task templates from design docs.
-- Existing templates are updated on conflict by template_code.
-- ============================================================

insert into public.task_template_master (template_code, task_name, category, discipline_id, task_group_id, default_duration, default_priority, is_active) values
${rows}
on conflict (template_code) do update set
  task_name = excluded.task_name,
  category = excluded.category,
  discipline_id = excluded.discipline_id,
  task_group_id = excluded.task_group_id,
  default_duration = excluded.default_duration,
  default_priority = excluded.default_priority,
  is_active = excluded.is_active,
  updated_at = now();
`;
}

// ====================================================================
// Write output
// ====================================================================
mkdirSync(OUTPUT_DIR, { recursive: true });

writeFileSync(join(OUTPUT_DIR, "20260624000021_task_group_master_extended.sql"), groupsSQL());
writeFileSync(join(OUTPUT_DIR, "20260624000022_task_template_master_extended.sql"), templatesSQL());

// Summary
console.log("=== Summary ===");
const byDisc = {};
for (const g of groups) {
  byDisc[g.discCode] = byDisc[g.discCode] || { groups: 0, tasks: 0 };
  byDisc[g.discCode].groups++;
}
for (const t of templates) {
  byDisc[t.discCode] = byDisc[t.discCode] || { groups: 0, tasks: 0 };
  byDisc[t.discCode].tasks++;
}
for (const [d, v] of Object.entries(byDisc)) {
  console.log(`${d}: ${v.groups} groups, ${v.tasks} tasks`);
}
console.log(`\nTotal: ${groups.length} groups, ${templates.length} templates`);
console.log(`\nWrote:`);
console.log(`  supabase/migrations/20260624000021_task_group_master_extended.sql`);
console.log(`  supabase/migrations/20260624000022_task_template_master_extended.sql`);
