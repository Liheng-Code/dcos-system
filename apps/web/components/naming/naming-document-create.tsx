"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface NamingDocumentCreateProps {
  projectId: string;
  onCreated?: () => void;
}

export function NamingDocumentCreate({ projectId, onCreated }: NamingDocumentCreateProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [override, setOverride] = useState(false);
  const [rules, setRules] = useState<{
    format_mask: string;
    discipline_codes: string[];
    document_types: string[];
    revision_format: string;
    running_number_scope: string;
  } | null>(null);
  const [projectCode, setProjectCode] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [buildingCodes, setBuildingCodes] = useState<{ code: string; name: string }[]>([]);

  const [selectedDisc, setSelectedDisc] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedDocType, setSelectedDocType] = useState("");
  const [nextSequence, setNextSequence] = useState(1);
  const [manualNumber, setManualNumber] = useState("");

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      supabase.from("project_numbering_rules").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("projects").select("project_code").eq("id", projectId).single(),
      supabase.from("building_codes").select("code, name").eq("is_active", true).order("sort_order"),
    ]).then(([ruleRes, projRes, bldRes]) => {
      if (ruleRes.data) {
        const r = ruleRes.data as typeof rules & { format_mask: string; revision_format: string; running_number_scope: string; discipline_codes: string[]; document_types: string[] };
        setRules(r);
        if (r.discipline_codes?.length) setSelectedDisc(r.discipline_codes[0]);
        if (r.document_types?.length) setSelectedDocType(r.document_types[0]);
        setSelectedLevel("G00");

        supabase.from("profiles").select("company_id").eq("id", supabase.auth.getUser().then(({ data }) => data.user?.id).then((uid) => uid || "")).single().then(({ data: pd }) => {
          if (pd?.company_id) {
            supabase.from("companies").select("code").eq("id", pd.company_id).single().then(({ data: cd }) => {
              if (cd) setCompanyCode(cd.code as string);
            });
          }
        });
      }
      if (projRes.data) setProjectCode((projRes.data as { project_code: string }).project_code);
      if (bldRes.data) setBuildingCodes(bldRes.data as { code: string; name: string }[]);
      setLoading(false);
    });
  }, [projectId, supabase]);

  useEffect(() => {
    if (!rules || !projectId) return;
    const scopeDisc = rules.running_number_scope === "per_discipline" ? selectedDisc : null;
    const scopeType = rules.running_number_scope === "per_doc_type" ? selectedDocType : null;
    supabase
      .from("document_running_numbers")
      .select("last_sequence")
      .eq("project_id", projectId)
      .eq("discipline_code", scopeDisc || "")
      .eq("document_type_code", scopeType || "")
      .maybeSingle()
      .then(({ data }) => {
        setNextSequence(data ? (data.last_sequence as number) + 1 : 1);
      });
  }, [rules, projectId, selectedDisc, selectedDocType, supabase]);

  const generatedNumber = useMemo(() => {
    if (!rules?.format_mask) return "";
    let code = rules.format_mask;
    code = code.replace("[PROJECT]", projectCode || "P001");
    code = code.replace("[COMPANY]", companyCode || "CMED");
    code = code.replace("[DISC]", selectedDisc || "ARC");
    code = code.replace("[BUILDING]", selectedBuilding || "BA");
    code = code.replace("[LEVEL]", selectedLevel || "G00");
    code = code.replace("[NNN]", String(nextSequence).padStart(3, "0"));
    code = code.replace("[REV]", rules.revision_format === "R00" ? "R00" : "Rev.0");
    return code;
  }, [rules, projectCode, companyCode, selectedDisc, selectedBuilding, selectedLevel, nextSequence]);

  const maskRegex = useMemo(() => {
    if (!rules?.format_mask) return null;
    let pattern = rules.format_mask;
    pattern = pattern.replace(/\[PROJECT\]/g, "[A-Z0-9-]+");
    pattern = pattern.replace(/\[COMPANY\]/g, "[A-Z]{2,4}");
    pattern = pattern.replace(/\[DISC\]/g, "[A-Z]{2,4}");
    pattern = pattern.replace(/\[BUILDING\]/g, "B[A-Z]");
    pattern = pattern.replace(/\[LEVEL\]/g, "[A-Z0-9]{2,4}");
    pattern = pattern.replace(/\[NNN\]/g, "\\d{3}");
    pattern = pattern.replace(/\[REV\]/g, "(R\\d{2}|Rev\\.\\d)");
    return new RegExp(`^${pattern}$`);
  }, [rules?.format_mask]);

  const currentNumber = override ? manualNumber : generatedNumber;
  const valid = maskRegex ? maskRegex.test(currentNumber) : true;

  async function handleCreate() {
    setSaving(true);
    const title = prompt("Document title:");
    if (!title) { setSaving(false); return; }

    const docType = await supabase.from("document_types").select("id").eq("code", selectedDocType).single();
    if (!docType.data) { toast.error("Document type not found"); setSaving(false); return; }

    const payload = {
      project_id: projectId,
      document_type_id: docType.data.id,
      document_number: currentNumber,
      title,
      discipline: selectedDisc || null,
      status: "draft",
    };

    const { error } = await supabase.from("documents").insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }

    const scopeDisc = rules?.running_number_scope === "per_discipline" ? selectedDisc : null;
    const scopeType = rules?.running_number_scope === "per_doc_type" ? selectedDocType : null;
    await supabase.from("document_running_numbers").upsert(
      { project_id: projectId, discipline_code: scopeDisc, document_type_code: scopeType, last_sequence: nextSequence },
      { onConflict: "project_id,discipline_code,document_type_code" }
    );

    toast.success(`Document ${currentNumber} created`);
    setSaving(false);
    onCreated?.();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rules) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Configure numbering rules in Step 7 first
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-primary">Auto-Generated Document</span>
      </div>
      <div className="rounded-lg bg-muted/30 p-3 font-mono text-sm break-all text-center">
        {currentNumber}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Discipline</Label>
          <select
            value={selectedDisc}
            onChange={(e) => setSelectedDisc(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary"
          >
            {rules.discipline_codes.map((dc) => (
              <option key={dc} value={dc}>{dc}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Building</Label>
          <select
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary"
          >
            <option value="">—</option>
            {buildingCodes.map((b) => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Level</Label>
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary"
          >
            <option value="G00">G00 — Ground Floor</option>
            <option value="B01">B01 — Basement 1</option>
            <option value="B02">B02 — Basement 2</option>
            <option value="B03">B03 — Basement 3</option>
            <option value="L01">L01 — Level 1</option>
            <option value="L02">L02 — Level 2</option>
            <option value="L03">L03 — Level 3</option>
            <option value="R00">R00 — Roof</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Document Type</Label>
          <select
            value={selectedDocType}
            onChange={(e) => setSelectedDocType(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary"
          >
            {rules.document_types.map((dt) => (
              <option key={dt} value={dt}>{dt}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-foreground"
          />
          Override
        </label>
        {override && (
          <div className="flex-1">
            <input
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
              placeholder="Enter custom document number..."
              className={`w-full rounded-xl border px-3 py-2 text-sm font-mono outline-hidden focus:border-primary ${
                valid ? "border-border" : "border-destructive/50"
              }`}
            />
          </div>
        )}
        {override && !valid && manualNumber && (
          <p className="text-xs text-destructive">Format does not match the project mask</p>
        )}
      </div>
      <Button onClick={handleCreate} disabled={saving || !valid || !currentNumber} className="w-full rounded-xl">
        {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
        Create Document
      </Button>
    </div>
  );
}
