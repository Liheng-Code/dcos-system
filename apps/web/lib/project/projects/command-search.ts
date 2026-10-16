// Matching for the Ctrl+K palette: "004 boq" finds project …004 at its BOQ tab, "tower" finds
// projects named Tower. Every word must match the project (code or name) or one destination.

import { projectHref } from "@/lib/project/projects/project-routes";
import { projectDestinations } from "@/lib/project/projects/project-tabs";

export interface PaletteProject {
  id: string;
  project_code: string;
  project_name: string;
  project_type: string;
  project_status?: string;
}

export interface PaletteResult {
  key: string;
  project: PaletteProject;
  /** null opens the project at its default tab. */
  destination: { id: string; label: string } | null;
  href: string;
}

const projectScore = (p: PaletteProject, t: string): number => {
  const code = p.project_code.toLowerCase();
  const name = p.project_name.toLowerCase();
  if (code.startsWith(t)) return 4;
  if (code.includes(t)) return 3;
  if (name.split(/\s+/).some((w) => w.startsWith(t))) return 2;
  return name.includes(t) ? 1 : 0;
};

const destinationScore = (d: { id: string; label: string }, t: string): number => {
  const label = d.label.toLowerCase();
  if (d.id === t || label.startsWith(t)) return 3;
  if (label.split(/[\s/&-]+/).some((w) => w.startsWith(t))) return 2;
  return label.includes(t) || d.id.includes(t) ? 1 : 0;
};

export function searchPalette(query: string, projects: PaletteProject[], limit = 12): PaletteResult[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const overview = (p: PaletteProject): PaletteResult => ({ key: p.id, project: p, destination: null, href: projectHref(p.project_code) });
  if (!tokens.length) return projects.slice(0, limit).map(overview);

  const scored: { result: PaletteResult; score: number }[] = [];
  for (const p of projects) {
    const pScores = tokens.map((t) => projectScore(p, t));
    if (pScores.every((s) => s > 0)) scored.push({ result: overview(p), score: pScores.reduce((a, b) => a + b, 0) });
    // A destination result needs a word only the destination explains, so "tower" alone stays one row.
    for (const d of projectDestinations(p.project_type)) {
      const dScores = tokens.map((t) => destinationScore(d, t));
      if (!tokens.every((_, i) => pScores[i] > 0 || dScores[i] > 0)) continue;
      if (!tokens.some((_, i) => pScores[i] === 0 && dScores[i] > 0)) continue;
      const score = tokens.reduce((sum, _, i) => sum + Math.max(pScores[i], dScores[i]), 0);
      scored.push({ result: { key: `${p.id}:${d.id}`, project: p, destination: d, href: projectHref(p.project_code, d.id) }, score });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.result.project.project_code.localeCompare(b.result.project.project_code))
    .slice(0, limit)
    .map((s) => s.result);
}
