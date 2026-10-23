import { groupTemplates, type ProjectKind, type TemplateFit } from "@/lib/template-fit";
import type { WbsTemplate } from "@/lib/project/wbs/wbs-template-queries";

interface PickableTemplate extends TemplateFit {
  id: string;
  template_name: string;
}

/**
 * <option>s for a WBS or level template <select>: templates that fit the project's building type
 * first ("Recommended"), then grouped by sector.
 */
export function TemplateOptions<T extends PickableTemplate>({ templates, project = {}, label = (t) => t.template_name }: { templates: T[]; project?: ProjectKind; label?: (t: T) => string }) {
  return (
    <>
      {groupTemplates(templates, project).map((g) => (
        <optgroup key={g.label} label={g.recommended ? "★ Recommended for this project" : g.label}>
          {g.items.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}
        </optgroup>
      ))}
    </>
  );
}

export function WbsTemplateOptions({ templates, project, showVersion = false }: { templates: WbsTemplate[]; project?: ProjectKind; showVersion?: boolean }) {
  return <TemplateOptions templates={templates} project={project} label={(t) => `${t.template_name}${showVersion ? ` (v${t.version})` : ""}`} />;
}
