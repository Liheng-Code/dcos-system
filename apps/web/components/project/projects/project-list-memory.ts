import { isProjectListView, type ProjectListView } from "@/lib/project/projects/project-routes";

// Per-viewer conveniences only; the URL stays the source of truth. Storage can be blocked
// (private windows, cleared site data), so every access is guarded.

const VIEW_KEY = "dcos_projects_view";
const LIST_QUERY_KEY = "dcos_projects_list_query";

/** The view last used, so the list reopens on the last selected bucket. */
export function readStoredView(): ProjectListView | undefined {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return isProjectListView(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The list's last query string (view + filters), so Back from a project restores it. */
export function readLastListQuery(): string | null {
  try {
    return sessionStorage.getItem(LIST_QUERY_KEY);
  } catch {
    return null;
  }
}

export function rememberList(view: ProjectListView, query: string) {
  try {
    localStorage.setItem(VIEW_KEY, view);
    sessionStorage.setItem(LIST_QUERY_KEY, query);
  } catch {
    // Storage unavailable: the list falls back to its defaults.
  }
}
