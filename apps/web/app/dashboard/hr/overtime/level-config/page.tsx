"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Shield, AlertCircle } from "lucide-react";
import { listOvertimeLevelConfig, updateOvertimeLevelConfigById } from "@/lib/hr/hr-queries";

interface LevelConfig {
  id: string;
  role_level: string;
  role_name: string;
  ot_eligible: boolean;
  max_hours_per_month: number | null;
  require_supervisor_approval: boolean;
  is_active: boolean;
}

export default function OTLevelConfigPage() {
  const [configs, setConfigs] = useState<LevelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    listOvertimeLevelConfig()
      .then(({ data, error }) => {
        if (data) setConfigs(data);
        if (error) setError(error.message);
        setLoading(false);
      });
  }, []);

  const updateField = (id: string, field: string, value: any) => {
    setConfigs((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    for (const cfg of configs) {
      const { error } = await updateOvertimeLevelConfigById({
          ot_eligible: cfg.ot_eligible,
          max_hours_per_month: cfg.max_hours_per_month || null,
          require_supervisor_approval: cfg.require_supervisor_approval,
          is_active: cfg.is_active,
          updated_by: user?.id,
        }, cfg.id);

      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    }

    setSuccess("Level configuration saved successfully");
    setSaving(false);
  };

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h1 className="text-2xl font-bold tracking-tight">OT Level Eligibility</h1>
          <p className="text-muted-foreground">Configure which staff levels can request overtime</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />{saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Staff Level OT Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Level</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">OT Eligible</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Max Hours/Month</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Require Approval</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Active</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((cfg) => (
                  <tr key={cfg.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{cfg.role_level}</td>
                    <td className="px-4 py-3 font-medium">{cfg.role_name}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => updateField(cfg.id, "ot_eligible", !cfg.ot_eligible)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${cfg.ot_eligible ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${cfg.ot_eligible ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Input
                        type="number"
                        className="w-24 h-8 text-center mx-auto text-xs"
                        value={cfg.max_hours_per_month ?? ""}
                        placeholder="Unlimited"
                        onChange={(e) => updateField(cfg.id, "max_hours_per_month", e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => updateField(cfg.id, "require_supervisor_approval", !cfg.require_supervisor_approval)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${cfg.require_supervisor_approval ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${cfg.require_supervisor_approval ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => updateField(cfg.id, "is_active", !cfg.is_active)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${cfg.is_active ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${cfg.is_active ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
