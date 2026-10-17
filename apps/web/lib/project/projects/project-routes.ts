// URLs of the Projects module. The list keeps its view and filters in the query string and a
// project is addressed by its code (unique, assigned by the database, never changes), so Back,
// refresh and shared links all restore the same screen.

export const PROJECTS_PATH = "/dashboard/projects";

export type ProjectListView = "pipeline" | "live" | "on_hold" | "completed" | "archived";
/** Cards (default), table, or — for tenders — a board grouped by stage. */
export type ProjectListLayout = "list" | "card" | "board";
/** What the New project dialog opens on: a tender (Pipeline) or an awarded project (Live). */
export type ProjectCreateKind = "tender" | "awarded";

const VALID_VIEWS = new Set<ProjectListView>(["pipeline", "live", "on_hold", "completed", "archived"]);

export function isProjectListView(value: string | null | undefined): value is ProjectListView {
  return !!value && VALID_VIEWS.has(value as ProjectListView);
}

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
  /** Filter by project_type outside the pure Tender Pipeline view. */
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

/**
 * Classifies a project into one of the five portfolio buckets:
 * - "on_hold": temporarily paused opportunities or projects awaiting a decision
 * - "completed": finished projects (status completed)
 * - "archived": archived records, or lost/cancelled/withdrawn/no-bid tenders
 * - "pipeline": active tenders (registered, in progress, submitted, under evaluation)
 * - "live": awarded & internal projects in award review, contract prep, or active execution
 */
export function projectViewBucket(
  project: { project_type: string; project_status: string },
  tenderStage?: string | null,
): ProjectListView {
  if (project.project_status === "on_hold") return "on_hold";
  if (project.project_status === "completed") return "completed";
  if (project.project_status === "archived") return "archived";
  if (project.project_type === "tender") {
    if (tenderStage === "unsuccessful" || tenderStage === "closed") return "archived";
    if (tenderStage === "awarded") return "live";
    return "pipeline";
  }
  return "live";
}

/** Tenders live in the Pipeline view; awarded and internal projects in Live. */
export function listViewForType(projectType: string, projectStatus?: string, tenderStage?: string | null): ProjectListView {
  if (projectStatus) {
    return projectViewBucket({ project_type: projectType, project_status: projectStatus }, tenderStage);
  }
  return projectType === "tender" ? "pipeline" : "live";
}

function normalizeView(raw: string | null, fallbackView: ProjectListView): ProjectListView {
  if (raw === "awarded") return "live";
  if (isProjectListView(raw)) return raw;
  return fallbackView;
}

export function parseProjectListParams(params: ParamReader, fallbackView: ProjectListView = "pipeline"): ProjectListState {
  const resolvedView = normalizeView(params.get("view"), fallbackView);
  return {
    view: resolvedView,
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    sector: params.get("sector") ?? "",
    type: resolvedView === "pipeline" ? "" : (params.get("type") ?? ""),
    layout: parseLayout(params.get("layout"), resolvedView === "pipeline"),
  };
}

function parseLayout(value: string | null, pipeline: boolean): ProjectListLayout {
  if (value === "list") return "list";
  if (value === "board" && pipeline) return "board";
  return "card";
}

/** Query string for a list state; empty filters and the default card layout are left out. */
export function projectListQuery(state: ProjectListState, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ view: state.view });
  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);
  if (state.sector) params.set("sector", state.sector);
  if (state.type && state.view !== "pipeline") params.set("type", state.type);
  if (state.layout !== "card" && !(state.layout === "board" && state.view !== "pipeline")) params.set("layout", state.layout);
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
