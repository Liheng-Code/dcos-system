"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, DollarSign, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface BudgetSection {
  id: string;
  group_code: string;
  group_name: string;
  section: string;
  section_name: string;
  description: string;
}

interface NamingBudgetPackagesProps {
  projectId: string | null;
  contractValue: number | null;
  onSaved?: () => void;
}

const GROUPS = ["A", "B", "C", "D", "E", "F"] as const;
const GROUP_NAMES: Record<string, string> = {
  A: "Early Works",
  B: "Sub-Structure",
  C: "Architecture External",
  D: "Interior Finishes",
  E: "Fittings & Equipment",
  F: "Building Services (MEP)",
};

export function NamingBudgetPackages({ projectId, contractValue, onSaved }: NamingBudgetPackagesProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<BudgetSection[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [contingency, setContingency] = useState("");
  const [costCodeTemplate, setCostCodeTemplate] = useState("");
  const [approvalLimitRule, setApprovalLimitRule] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([...GROUPS]);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    Promise.all([
      supabase.from("budget_package_sections").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("project_budget_settings").select("*").eq("project_id", projectId).maybeSingle(),
    ]).then(([secRes, settingsRes]) => {
      if (secRes.data) setSections(secRes.data as BudgetSection[]);
      if (settingsRes.data) {
        const s = settingsRes.data as { contingency: number | null; cost_code_template: string | null; approval_limit_rule: string | null; selected_sections: string[] };
        if (s.contingency !== null && s.contingency !== undefined) setContingency(s.contingency.toString());
        if (s.cost_code_template) setCostCodeTemplate(s.cost_code_template);
        if (s.approval_limit_rule) setApprovalLimitRule(s.approval_limit_rule);
        if (s.selected_sections?.length) setSelectedSections(s.selected_sections);
      }
      setLoading(false);
    });
  }, [projectId, supabase]);

  const grouped = useMemo(() => {
    const map: Record<string, BudgetSection[]> = {};
    for (const g of GROUPS) map[g] = [];
    for (const s of sections) {
      if (map[s.group_code]) map[s.group_code].push(s);
    }
    return map;
  }, [sections]);

  const groupSelected = (group: string) => {
    return grouped[group].every((s) => selectedSections.includes(s.section));
  };

  const someSelected = (group: string) => {
    return grouped[group].some((s) => selectedSections.includes(s.section));
  };

  function toggleSection(sectionCode: string) {
    setSelectedSections((prev) => {
      const next = prev.includes(sectionCode)
        ? prev.filter((s) => s !== sectionCode)
        : [...prev, sectionCode];
      return next;
    });
  }

  function toggleGroup(group: string) {
    const groupSectionCodes = grouped[group].map((s) => s.section);
    if (groupSelected(group)) {
      setSelectedSections((prev) => prev.filter((s) => !groupSectionCodes.includes(s)));
    } else {
      setSelectedSections((prev) => {
        const existing = prev.filter((s) => !groupSectionCodes.includes(s));
        return [...existing, ...groupSectionCodes];
      });
    }
  }

  function toggleGroupExpanded(group: string) {
    setExpandedGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
    );
  }

  useEffect(() => {
    if (!costCodeTemplate && selectedSections.length > 0) {
      const firstSection = sections.find((s) => s.section === selectedSections[0]);
      if (firstSection) {
        setCostCodeTemplate(`${firstSection.section}.01-XX`);
      }
    }
  }, [selectedSections, sections, costCodeTemplate]);

  async function handleSave() {
    if (!projectId) { toast.error("No project selected"); return; }
    setSaving(true);
    const payload = {
      project_id: projectId,
      contingency: contingency ? parseFloat(contingency) : null,
      cost_code_template: costCodeTemplate || null,
      approval_limit_rule: approvalLimitRule || null,
      selected_sections: selectedSections,
    };
    const { error } = await supabase
      .from("project_budget_settings")
      .upsert(payload, { onConflict: "project_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Budget settings saved");
    onSaved?.();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Contract Value ($)</Label>
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm font-mono">
            {contractValue?.toLocaleString() ?? "—"}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Contingency (%)</Label>
          <input
            type="number" step="0.1" min="0" max="100"
            value={contingency}
            onChange={(e) => setContingency(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
            placeholder="e.g. 5"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cost Code Template</Label>
          <input
            value={costCodeTemplate}
            onChange={(e) => setCostCodeTemplate(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary"
            placeholder="Auto-suggested from selection"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Package Sections</Label>
        <p className="text-xs text-muted-foreground mb-1">
          {selectedSections.length} of {sections.length} sections selected
        </p>
        <div className="rounded-xl border bg-white divide-y max-h-96 overflow-y-auto">
          {GROUPS.filter((g) => grouped[g].length > 0).map((group) => (
            <div key={group}>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 sticky top-0">
                <button
                  type="button"
                  onClick={() => toggleGroupExpanded(group)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expandedGroups.includes(group) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <label className="flex items-center gap-2 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={groupSelected(group)}
                    ref={(el) => { if (el) el.indeterminate = !groupSelected(group) && someSelected(group); }}
                    onChange={() => toggleGroup(group)}
                    className="h-4 w-4 rounded border-border accent-foreground"
                  />
                  <span className="text-sm font-medium">
                    Group {group} — {GROUP_NAMES[group]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({selectedSections.filter((s) => s.startsWith(`${group}.`)).length}/{grouped[group].length})
                  </span>
                </label>
              </div>
              {expandedGroups.includes(group) && (
                <div className="px-4 py-1.5 space-y-0.5">
                  {grouped[group].map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 py-1 cursor-pointer group hover:bg-muted/20 rounded-lg px-2"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSections.includes(s.section)}
                        onChange={() => toggleSection(s.section)}
                        className="h-3.5 w-3.5 rounded border-border accent-foreground"
                      />
                      <span className="text-xs font-mono font-medium w-14">{s.section}</span>
                      <span className="text-xs text-foreground">{s.section_name}</span>
                      {s.description && (
                        <span className="text-[10px] text-muted-foreground truncate">{s.description}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-1.5">
          <Label>Approval Limit Rule</Label>
          <select
            value={approvalLimitRule}
            onChange={(e) => setApprovalLimitRule(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
          >
            <option value="">— Select Rule —</option>
            <option value="pm_approves_upto_50k">PM approves up to $50K</option>
            <option value="director_approves_upto_200k">Director approves up to $200K</option>
            <option value="board_approves_above_200k">Board approves above $200K</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button onClick={handleSave} disabled={saving || !projectId} className="rounded-xl">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Budget Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
