"use client";

import { useEffect, useState } from "react";
import { listCompanies, updateCompanyById } from "@/lib/naming/naming-queries";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Company {
  id: string;
  name: string;
  code: string;
}

export function NamingCompanyAbbreviations() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editMap, setEditMap] = useState<Record<string, string>>({});

  useEffect(() => {
    listCompanies().then(({ data, error }) => {
      if (data) setCompanies(data as Company[]);
      if (error) toast.error("Failed to load companies");
      setLoading(false);
    });
  }, []);

  function validateCode(code: string): string | null {
    if (!/^[A-Z]{4}$/.test(code)) return "Must be exactly 4 uppercase letters";
    return null;
  }

  async function handleSave(id: string) {
    const code = editMap[id];
    if (!code) return;
    const error = validateCode(code);
    if (error) { toast.error(error); return; }
    setSaving(true);
    const { error: dbErr } = await updateCompanyById({ code }, id);
    if (dbErr) {
      toast.error(dbErr.message);
    } else {
      setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, code } : c)));
      setEditMap((prev) => { const { [id]: _, ...rest } = prev; return rest; });
      toast.success("Company code updated");
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Company codes must be exactly <strong>4 uppercase letters</strong>. Used in document numbers and transmittals.
      </p>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Company Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Code</th>
              <th className="w-20 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2.5 text-sm">{company.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      value={editMap[company.id] ?? company.code}
                      onChange={(e) => setEditMap((prev) => ({ ...prev, [company.id]: e.target.value.toUpperCase() }))}
                      className={`w-24 rounded border px-2 py-1 font-mono text-sm uppercase outline-hidden focus:border-primary ${
                        editMap[company.id] && validateCode(editMap[company.id])
                          ? "border-destructive"
                          : "border-border"
                      }`}
                      maxLength={4}
                    />
                    {editMap[company.id] && validateCode(editMap[company.id]) && (
                      <span className="text-xs text-destructive">{validateCode(editMap[company.id])}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSave(company.id)}
                    disabled={!editMap[company.id] || saving || !!validateCode(editMap[company.id])}
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
