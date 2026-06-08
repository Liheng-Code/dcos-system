"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TemplateEditSheet, type StakeholderTemplate } from "@/components/stakeholders/template-edit-sheet";

export function TemplateListPage() {
  const [templates, setTemplates] = useState<StakeholderTemplate[]>([]);
  const [placeholderCounts, setPlaceholderCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StakeholderTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function loadData() {
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      supabase.from("stakeholder_templates").select("*").order("name", { ascending: true }),
      supabase.from("template_placeholders").select("id, template_id"),
    ]).then(([templatesRes, placeholdersRes]) => {
      if (templatesRes.data) setTemplates(templatesRes.data as StakeholderTemplate[]);
      if (placeholdersRes.data) {
        const counts: Record<string, number> = {};
        for (const p of placeholdersRes.data) {
          counts[p.template_id] = (counts[p.template_id] ?? 0) + 1;
        }
        setPlaceholderCounts(counts);
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
    });
  }, [templates, search]);

  function handleSave(template: StakeholderTemplate) {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === template.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = template;
        return next;
      }
      return [template, ...prev];
    });
    setSelected(null);
    setShowCreate(false);
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </p>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Create Template
          </Button>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-hidden placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Description</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Placeholders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    {search ? "No templates match your search" : "No templates yet. Create your first template to get started."}
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/50",
                      selected?.id === t.id && "bg-primary/5",
                    )}
                  >
                    <td className="px-3 py-2.5 font-medium text-foreground">{t.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{t.description || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">
                        {placeholderCounts[t.id] ?? 0}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <TemplateEditSheet
          template={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
        />
      )}

      {showCreate && (
        <TemplateEditSheet
          template={null}
          onClose={() => setShowCreate(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
