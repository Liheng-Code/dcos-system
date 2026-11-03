// What is released to users by default. Edit this file to release a page or module.
//
// Anything NOT listed here ships as "development": hidden from the sidebar and
// module hub, and its route blocked, until an admin switches it on in
// Administration > Module Settings (a nav_item_settings row always wins), or
// NEXT_PUBLIC_DCOS_SHOW_DEV_FEATURES=true is set locally.
//
// Keys are module_settings keys. Values:
//   "all"     every page and group of the module is released;
//   string[]  only these nav keys are released: a page's href (e.g. "/dashboard/projects")
//             or a group key ("group:<module>:<slug>"). A page inside a group also needs
//             its group listed.
// A module that is not a key here has nothing released.
// Nav keys come from lib/modules/manifests and the module's *-nav.ts file.

export const RELEASED: Record<string, "all" | string[]> = {
  // The platform shell: users, roles and Module Settings must always be reachable.
  administration: "all",
  project: ["/dashboard", "/dashboard/projects"],
  hr: ["group:hr:workforce", "/dashboard/hr/employees"],
  // Planning Wave 1, core scheduling (doc 22; released 2026-11-03 after the P2 release checks). The Look-ahead's
  // sub-tabs (Weekly Plans, S-Curve, Progress Reviews) follow their parent. MS Project Sync and the newer pages
  // (Forecast, Contract Milestones, Schedule Check) stay in development until their wave.
  planning: [
    "group:planning:schedule",
    "/dashboard/planning/overview",
    "/dashboard/planning",
    "/dashboard/planning/gantt",
    "/dashboard/planning/sheet",
    "/dashboard/wbs/lookahead",
    "/dashboard/planning/calendars",
    "/dashboard/planning/comparison",
  ],
};

export function isReleased(moduleKey: string, navKey: string): boolean {
  const entry = RELEASED[moduleKey];
  if (!entry) return false;
  return entry === "all" || entry.includes(navKey);
}
