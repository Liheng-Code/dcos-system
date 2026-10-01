"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, FileText, Eye } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getCompanyById, getProfileById, getProjectById, getProjectNumberingRuleByProjectId, listDisciplineCodesWithIsActive, listDocumentTypesWithIsActive, upsertProjectNumberingRules } from "@/lib/naming/naming-queries";

interface NamingNumberingRulesProps {
  projectId: string | null;
  onSaved?: () => void;
}

interface RuleData {
  format_mask: string;
  discipline_codes: string[];
  document_types: string[];
  revision_format: string;
  running_number_scope: string;
}

const SEGMENTS = [
  { key: "PROJECT", label: "Project Code", mandatory: true },
  { key: "COMPANY", label: "Company Code", mandatory: true },
  { key: "DISC", label: "Discipline", mandatory: false },
  { key: "BUILDING", label: "Building", mandatory: false },
  { key: "LEVEL", label: "Level", mandatory: false },
  { key: "NNN", label: "Running No.", mandatory: true },
  { key: "REV", label: "Revision", mandatory: true },
];

const SCOPE_OPTIONS = [
  { value: "per_project", label: "Per Project", desc: "Single counter for all documents" },
  { value: "per_discipline", label: "Per Discipline", desc: "Counter resets per discipline" },
  { value: "per_doc_type", label: "Per Doc Type", desc: "Counter resets per document type" },
];

const REV_OPTIONS = [
  { value: "R00", label: "R00 (R00, R01, R02...)" },
  { value: "Rev.N", label: "Rev.N (Rev.0, Rev.1...)" },
];

export function NamingNumberingRules({ projectId, onSaved }: NamingNumberingRulesProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disciplines, setDisciplines] = useState<{ code: string; name: string }[]>([]);
  const [docTypes, setDocTypes] = useState<{ code: string; name: string }[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [projectCode, setProjectCode] = useState("");

  const [rules, setRules] = useState<RuleData>({
    format_mask: "[PROJECT]-[COMPANY]-[DISC]-[BUILDING]-[LEVEL]-[NNN]-[REV]",
    discipline_codes: [],
    document_types: [],
    revision_format: "R00",
    running_number_scope: "per_discipline",
  });

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;
      Promise.all([
        listDisciplineCodesWithIsActive(),
        listDocumentTypesWithIsActive(),
        getProjectNumberingRuleByProjectId(projectId),
        uid ? getProfileById(uid) : Promise.resolve({ data: null }),
        getProjectById(projectId, "project_code"),
      ]).then(([discRes, dtRes, ruleRes, profileRes, projRes]) => {
        if (discRes.data) setDisciplines(discRes.data as { code: string; name: string }[]);
        if (dtRes.data) setDocTypes(dtRes.data as { code: string; name: string }[]);

        if (profileRes.data?.company_id) {
          getCompanyById(profileRes.data.company_id, "code").then(({ data: cd }) => {
            if (cd) setCompanyCode(cd.code as string);
          });
        }

        if (projRes.data) setProjectCode((projRes.data as { project_code: string }).project_code);

      if (ruleRes.data) {
        const r = ruleRes.data as RuleData & { format_mask: string; revision_format: string; running_number_scope: string };
        setRules({
          format_mask: r.format_mask,
          discipline_codes: (r.discipline_codes as string[]) || [],
          document_types: (r.document_types as string[]) || [],
          revision_format: r.revision_format || "R00",
          running_number_scope: r.running_number_scope || "per_discipline",
        });
      }
      setLoading(false);
    });
    })();
  }, [projectId, supabase]);

  const toggleArray = (arr: string[], item: string): string[] =>
    arr.includes(item) ? arr.filter((c) => c !== item) : [...arr, item];

  const selectedSegments = useMemo(() => {
    return SEGMENTS.filter((s) =>
      s.mandatory || rules.format_mask.includes(`[${s.key}]`)
    );
  }, [rules.format_mask]);

  const preview = useMemo(() => {
    let code = rules.format_mask;
    code = code.replace("[PROJECT]", projectCode || "P001-HTBT");
    code = code.replace("[COMPANY]", companyCode || "CMED");
    code = code.replace("[DISC]", rules.discipline_codes[0] || "ARC");
    code = code.replace("[BUILDING]", "BA");
    code = code.replace("[LEVEL]", "G00");
    code = code.replace("[NNN]", "001");
    code = code.replace("[REV]", rules.revision_format === "R00" ? "R00" : "Rev.0");
    return code;
  }, [rules.format_mask, projectCode, companyCode, rules.discipline_codes, rules.revision_format]);

  function toggleSegment(key: string) {
    setRules((prev) => {
      const segs = SEGMENTS.filter((s) => s.mandatory || prev.format_mask.includes(`[${s.key}]`));
      const has = prev.format_mask.includes(`[${key}]`);
      if (has) {
        const remaining = segs.filter((s) => s.key !== key);
        const mask = remaining.map((s) => `[${s.key}]`).join("-");
        return { ...prev, format_mask: mask };
      } else {
        const next = [...segs, SEGMENTS.find((s) => s.key === key)!]
          .sort((a, b) => {
            const order = SEGMENTS.map((s) => s.key);
            return order.indexOf(a.key) - order.indexOf(b.key);
          });
        const mask = next.map((s) => `[${s.key}]`).join("-");
        return { ...prev, format_mask: mask };
      }
    });
  }

  async function handleSave() {
    if (!projectId) { toast.error("No project selected"); return; }
    setSaving(true);
    const payload = {
      project_id: projectId,
      format_mask: rules.format_mask,
      discipline_codes: rules.discipline_codes,
      document_types: rules.document_types,
      revision_format: rules.revision_format,
      running_number_scope: rules.running_number_scope,
    };
    const { error } = await upsertProjectNumberingRules(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Numbering rules saved");
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
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Format Mask Segments</Label>
            <p className="text-xs text-muted-foreground mb-2">Toggle optional segments on/off:</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SEGMENTS.map((seg) => (
                <label
                  key={seg.key}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    seg.mandatory
                      ? "bg-primary/5 border-primary/20 cursor-default"
                      : rules.format_mask.includes(`[${seg.key}]`)
                        ? "bg-primary/5 border-primary/30"
                        : "bg-background border-border hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={seg.mandatory || rules.format_mask.includes(`[${seg.key}]`)}
                    disabled={seg.mandatory}
                    onChange={() => toggleSegment(seg.key)}
                    className="h-3.5 w-3.5 rounded border-border accent-foreground"
                  />
                  <div>
                    <span className="text-xs font-mono font-medium">[{seg.key}]</span>
                    <span className="text-[10px] text-muted-foreground ml-1">{seg.label}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Revision Format</Label>
            <select
              value={rules.revision_format}
              onChange={(e) => setRules((p) => ({ ...p, revision_format: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
            >
              {REV_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Running Number Scope</Label>
            <select
              value={rules.running_number_scope}
              onChange={(e) => setRules((p) => ({ ...p, running_number_scope: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Live Preview</span>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 font-mono text-sm break-all">
              {preview}
            </div>
            <p className="text-xs text-muted-foreground">
              Sample using first selected discipline and default building/level
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Numbering Rules
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Active Discipline Codes</Label>
          <p className="text-xs text-muted-foreground">Select disciplines used in this project:</p>
          <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto rounded-xl border bg-white p-3">
            {disciplines.map((d) => (
              <label key={d.code} className="flex items-center gap-1.5 cursor-pointer group text-xs">
                <input
                  type="checkbox"
                  checked={rules.discipline_codes.includes(d.code)}
                  onChange={() => setRules((p) => ({ ...p, discipline_codes: toggleArray(p.discipline_codes, d.code) }))}
                  className="h-3 w-3 rounded border-border accent-foreground"
                />
                <span className="font-mono font-medium group-hover:text-foreground">{d.code}</span>
                <span className="text-muted-foreground truncate">{d.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Active Document Types</Label>
          <p className="text-xs text-muted-foreground">Select document types used in this project:</p>
          <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto rounded-xl border bg-white p-3">
            {docTypes.map((d) => (
              <label key={d.code} className="flex items-center gap-1.5 cursor-pointer group text-xs">
                <input
                  type="checkbox"
                  checked={rules.document_types.includes(d.code)}
                  onChange={() => setRules((p) => ({ ...p, document_types: toggleArray(p.document_types, d.code) }))}
                  className="h-3 w-3 rounded border-border accent-foreground"
                />
                <span className="font-mono font-medium group-hover:text-foreground">{d.code}</span>
                <span className="text-muted-foreground truncate">{d.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
