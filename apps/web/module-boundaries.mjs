// Module ownership map for apps/web, enforced by the `dcos/module-boundaries`
// ESLint rule (eslint-rules/module-boundaries.mjs).
//
// Every source file belongs to exactly one module: the business module whose
// path list below contains it, or "core" (the platform shell and shared
// foundation) when none does.
//
// The rule:
//   - any file may import core;
//   - a file may import anything inside its own module;
//   - a file may import another business module ONLY through that module's
//     public API (PUBLIC_API below);
//   - core may import a business module only through its public API too.
//
// To let other modules use something, add it to its module's PUBLIC_API entry
// (a deliberate, reviewed change) or move it into core. Paths are relative to
// apps/web; a folder owns everything beneath it.

/** @type {Record<string, string[]>} keyed by module_settings.module_key */
export const MODULE_PATHS = {
  hr: [
    "components/hr",
    "components/telegram",
    "lib/hr",
    "lib/telegram",
    "app/dashboard/hr",
    "app/api/hr",
    "app/api/telegram",
    "app/telegram-app",
    // Leave year-end run: an HR page that sits under the Administration routes.
    "app/dashboard/administration/year-end",
  ],
  qs: [
    "components/qs",
    "components/tenders",
    "components/qto",
    "lib/qs",
    "app/dashboard/qs",
    "app/dashboard/tenders",
    "app/dashboard/qto",
    "app/dashboard/contracts",
    "app/dashboard/subcontractors",
    "app/api/tenders",
    "hooks/use-qs-permissions.ts",
    "hooks/use-qto-permissions.ts",
    "hooks/use-tender-permissions.ts",
    "hooks/use-qs-library-search.ts",
  ],
  planning: [
    "components/planning",
    "lib/planning",
    "app/dashboard/planning",
    "app/api/planning",
    "app/portal/programme",
    // Look-ahead is a Planning feature whose route and views still sit under wbs.
    "app/dashboard/wbs/lookahead",
    "components/wbs/wbs-lookahead-view.tsx",
    "components/wbs/wbs-lookahead-timeline.tsx",
    "components/wbs/wbs-scurve-chart.tsx",
    "components/wbs/wbs-gantt-view.tsx",
    "hooks/use-planning-permissions.ts",
    "contexts/planning-permissions-context.tsx",
  ],
  procurement: ["components/procurement", "lib/procurement", "app/dashboard/procurement"],
  inventory: ["components/inv", "lib/inv", "app/dashboard/inventory", "app/api/inv"],
  design: [
    "components/design",
    "components/bim",
    "lib/design",
    "lib/bim",
    "app/dashboard/design",
    "app/api/bim",
    "hooks/use-bim-viewer.ts",
  ],
  construction: [
    "components/construction",
    "lib/construction",
    "app/dashboard/site",
    "app/dashboard/qaqc",
    "app/dashboard/hse",
  ],
  document_control: ["components/documents", "lib/documents", "app/dashboard/documents", "app/verify/doc"],
  account: ["components/account", "lib/account", "app/dashboard/account"],
  // components/reports (chart and report-frame primitives) is shared UI, so it is core.
  reporting: [
    "components/insights",
    "lib/reporting",
    "app/dashboard/reports",
    "app/dashboard/insights",
  ],
};

// Files other modules (and core) may import. Everything else in a module is internal.
/** @type {Record<string, string[]>} */
export const PUBLIC_API = {
  hr: [
    "lib/hr/hr-nav.ts",
    // Dashboard widget.
    "components/hr/leave/who-is-on-leave-today.tsx",
    // Telegram message sender, used by the notification dispatcher.
    "lib/telegram/bot.ts",
  ],
  qs: [
    "lib/qs/qs-nav.ts",
    // Named exports of the two large QS services that others may use.
    "lib/qs/public.ts",
    "lib/qs/public-tender.ts",
    // Owner of tender_stage and its transitions; the project screens drive it.
    "lib/qs/tender-lifecycle.ts",
    // Bid review, approval and submission steps; driven from the project screens.
    "lib/qs/tender-approval.ts",
    "hooks/use-tender-permissions.ts",
    // Dashboard widget.
    "components/qs/cost-control.tsx",
  ],
  planning: [
    "lib/planning/planning-nav.ts",
    // Named exports of the resource service that others may use.
    "lib/planning/public.ts",
    // Working-day arithmetic.
    "lib/planning/work-calendar.ts",
    // Progress snapshots: the progress data earned-value and dashboards read.
    "lib/planning/schedule-service.ts",
    // Baselines: set when a tender is converted to a contract.
    "lib/planning/baseline-service.ts",
    // Weighted activity steps of a WBS task, edited from the WBS task panel.
    "lib/planning/activity-steps-service.ts",
  ],
  procurement: [
    "lib/procurement/procurement-nav.ts",
    // Raise a purchase requisition from BOQ lines; opened from the QS BOQ builder.
    "components/procurement/raise-pr-from-boq-dialog.tsx",
  ],
  inventory: ["lib/inv/inventory-nav.ts"],
  design: ["lib/design/design-nav.ts"],
  construction: [
    "lib/construction/construction-nav.ts",
    // Named exports of the site daily-report service that others may use.
    "lib/construction/site/public.ts",
  ],
  document_control: [
    "lib/documents/document-control-nav.ts",
    // Printable transmittal sheet, reused by the naming transmittal detail.
    "components/documents/transmittals/dtn-printable-sheet.tsx",
  ],
  account: ["lib/account/account-nav.ts"],
  reporting: ["lib/reporting/reporting-nav.ts"],
};

export const CORE = "core";

const stripExt = (p) => p.replace(/\.(tsx?|mts|mjs|jsx?)$/, "");

const OWNERS = Object.entries(MODULE_PATHS).flatMap(([module, paths]) =>
  paths.map((p) => ({ module, path: stripExt(p) })),
);
const PUBLIC = new Set(Object.values(PUBLIC_API).flat().map(stripExt));

/** Module that owns a path relative to apps/web (with or without extension). */
export function moduleOf(relPath) {
  const p = stripExt(relPath.replace(/\\/g, "/"));
  let best = null;
  for (const owner of OWNERS) {
    if ((p === owner.path || p.startsWith(owner.path + "/")) && (!best || owner.path.length > best.path.length)) {
      best = owner;
    }
  }
  return best ? best.module : CORE;
}

export function isPublicApi(relPath) {
  return PUBLIC.has(stripExt(relPath.replace(/\\/g, "/")));
}
