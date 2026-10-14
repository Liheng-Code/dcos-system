// URLs of the Projects module. The list keeps its view and filters in the query string and a
// project is addressed by its code (unique, assigned by the database, never changes), so Back,
// refresh and shared links all restore the same screen.

export const PROJECTS_PATH = "/dashboard/projects";

export type ProjectListView = "pipeline" | "live";
/** Table (default), cards, or — for tenders — a board grouped by stage. */
export type ProjectListLayout = "list" | "card" | "board";
/** What the New project dialog opens on: a tender (Pipeline) or an awarded project (Live). */
export type ProjectCreateKind = "tender" | "awarded";

/** Sections of a project's Settings tab, in page order. */
export const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "contract", label: "Contract & people" },
  { id: "calendar", label: "Calendar" },
  { id: "wbs", label: "WBS" },
  { id: "numbering", label: "Document numbering" },
  { id: "approvals", label: "Approval flows" },
  { id: "budget", label: "Budget" },
  { id: "notifications", label: "Notifications" },
] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export function settingsHref(code: string, section?: SettingsSectionId): string {
  return projectHref(code, "settings") + (section ? `?section=${section}` : "");
}

export interface ProjectListState {
  view: ProjectListView;
  q: string;
  status: string;
  sector: string;
  /** Post-contract only: awarded / internal. */
  type: string;
  layout: ProjectListLayout;
}

interface ParamReader {
  get(name: string): string | null;
}

export function projectHref(code: string, tab?: string | null): string {
  const base = `${PROJECTS_PATH}/${encodeURIComponent(code)}`;
  return tab ? `${base}/${encodeURIComponent(tab)}` : base;
}

/** Tenders live in the Pipeline view; awarded and internal projects in Live. */
export function listViewForType(projectType: string): ProjectListView {
  return projectType === "tender" ? "pipeline" : "live";
}

export function parseProjectListParams(params: ParamReader, fallbackView: ProjectListView = "pipeline"): ProjectListState {
  const view = params.get("view");
  return {
    view: view === "pipeline" || view === "live" ? view : fallbackView,
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    sector: params.get("sector") ?? "",
    type: view === "pipeline" ? "" : (params.get("type") ?? ""),
    layout: parseLayout(params.get("layout"), view === "pipeline" || (view !== "live" && fallbackView === "pipeline")),
  };
}

function parseLayout(value: string | null, pipeline: boolean): ProjectListLayout {
  if (value === "card") return "card";
  if (value === "board" && pipeline) return "board";
  return "list";
}

/** Query string for a list state; empty filters and the default table layout are left out. */
export function projectListQuery(state: ProjectListState, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ view: state.view });
  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);
  if (state.sector) params.set("sector", state.sector);
  if (state.type && state.view === "live") params.set("type", state.type);
  if (state.layout !== "list" && !(state.layout === "board" && state.view !== "pipeline")) params.set("layout", state.layout);
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
  return params.toString();
}

// The old wizard links (?new=precontract | project | template) still open the dialog.
const CREATE_KIND_ALIASES: Record<string, ProjectCreateKind> = {
  tender: "tender",
  precontract: "tender",
  awarded: "awarded",
  project: "awarded",
  template: "awarded",
};

export function parseCreateKind(value: string | null): ProjectCreateKind | null {
  return value && Object.hasOwn(CREATE_KIND_ALIASES, value) ? CREATE_KIND_ALIASES[value] : null;
}
