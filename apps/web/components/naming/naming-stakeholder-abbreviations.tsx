"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Stakeholder {
  id: string;
  organization_name: string;
  stakeholder_type: string;
}

interface StakeholderAbbr {
  id: string;
  stakeholder_id: string;
  abbreviation: string;
}

export function NamingStakeholderAbbreviations() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [abbrs, setAbbrs] = useState<Record<string, StakeholderAbbr>>({});
  const [editMap, setEditMap] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      supabase.from("stakeholders").select("id, organization_name, stakeholder_type").order("organization_name"),
      supabase.from("stakeholder_abbreviations").select("*"),
    ]).then(([sRes, aRes]) => {
      if (sRes.data) setStakeholders(sRes.data as Stakeholder[]);
      if (aRes.data) {
        const map: Record<string, StakeholderAbbr> = {};
        (aRes.data as StakeholderAbbr[]).forEach((a) => { map[a.stakeholder_id] = a; });
        setAbbrs(map);
      }
      if (sRes.error) toast.error("Failed to load stakeholders");
      setLoading(false);
    });
  }, [supabase]);

  function validateAbbr(abbr: string): string | null {
    if (!/^[A-Z0-9]{3,4}$/.test(abbr)) return "3–4 uppercase alphanumeric characters";
    return null;
  }

  async function handleSave(stakeholderId: string) {
    const abbr = editMap[stakeholderId];
    if (!abbr) return;
    const err = validateAbbr(abbr);
    if (err) { toast.error(err); return; }
    setSaving(true);
    const existing = abbrs[stakeholderId];
    let error;
    if (existing) {
      ({ error } = await supabase.from("stakeholder_abbreviations").update({ abbreviation: abbr }).eq("id", existing.id));
    } else {
      const { error: insErr } = await supabase.from("stakeholder_abbreviations").insert({
        stakeholder_id: stakeholderId,
        abbreviation: abbr,
      });
      error = insErr;
    }
    if (error) {
      toast.error(error.message);
    } else {
      setAbbrs((prev) => ({
        ...prev,
        [stakeholderId]: { id: existing?.id ?? "", stakeholder_id: stakeholderId, abbreviation: abbr },
      }));
      setEditMap((prev) => { const { [stakeholderId]: _, ...rest } = prev; return rest; });
      toast.success(existing ? "Abbreviation updated" : "Abbreviation added");
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Each stakeholder needs a <strong>3–4 letter code</strong> for transmittal routing (e.g. <code className="bg-muted px-1 rounded">GGD</code>, <code className="bg-muted px-1 rounded">ARC</code>).
      </p>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Stakeholder</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Abbreviation</th>
              <th className="w-16 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {stakeholders.map((s) => {
              const currentAbbr = abbrs[s.id]?.abbreviation ?? "";
              const editValue = editMap[s.id] ?? currentAbbr;
              const validationError = editValue ? validateAbbr(editValue) : null;
              const isDirty = editMap[s.id] !== undefined;
              return (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm">{s.organization_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {s.stakeholder_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={editValue}
                        onChange={(e) => setEditMap((prev) => ({ ...prev, [s.id]: e.target.value.toUpperCase() }))}
                        placeholder={currentAbbr || "---"}
                        className={`w-24 rounded border px-2 py-1 font-mono text-sm uppercase outline-hidden focus:border-primary ${
                          isDirty && validationError ? "border-destructive" : "border-border"
                        }`}
                        maxLength={4}
                      />
                      {isDirty && validationError && (
                        <span className="text-xs text-destructive">{validationError}</span>
                      )}
                      {!isDirty && currentAbbr && (
                        <span className="text-xs text-muted-foreground">Saved</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSave(s.id)}
                      disabled={!isDirty || saving || !!validationError}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
