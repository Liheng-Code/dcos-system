"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Save, Shield } from "lucide-react";

interface Limit {
  id: string;
  limit_type: string;
  max_hours: number;
  escalation_required: boolean;
  is_active: boolean;
}

const LIMIT_LABELS: Record<string, string> = {
  daily: "Daily Limit",
  weekly: "Weekly Limit",
  monthly: "Monthly Limit",
};

const LIMIT_DESCRIPTIONS: Record<string, string> = {
  daily: "Maximum overtime hours per day (§16)",
  weekly: "Maximum overtime hours per week (§17)",
  monthly: "Maximum overtime hours per month — triggers escalation if exceeded (§18)",
};

export default function OTLimitsPage() {
  const [limits, setLimits] = useState<Limit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("overtime_limits")
      .select("*")
      .order("limit_type")
      .then(({ data, error }) => {
        if (data) setLimits(data);
        setLoading(false);
      });
  }, []);

  const updateField = (id: string, field: string, value: any) => {
    setLimits((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    for (const limit of limits) {
      const { error } = await supabase
        .from("overtime_limits")
        .update({
          max_hours: limit.max_hours,
          escalation_required: limit.escalation_required,
          is_active: limit.is_active,
        })
        .eq("id", limit.id);

      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    }

    setSuccess("Limits updated successfully");
    setSaving(false);
  };

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">OT Limits Configuration</h1>
          <p className="text-muted-foreground">Configure daily, weekly, and monthly overtime caps</p>
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

      <div className="space-y-4">
        {limits.map((limit) => (
          <Card key={limit.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5" />
                {LIMIT_LABELS[limit.limit_type] || limit.limit_type}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{LIMIT_DESCRIPTIONS[limit.limit_type]}</p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Max Hours</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={limit.max_hours}
                    onChange={(e) => updateField(limit.id, "max_hours", parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Escalation Required</Label>
                  <div className="flex h-10 items-center">
                    <button
                      onClick={() => updateField(limit.id, "escalation_required", !limit.escalation_required)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${limit.escalation_required ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${limit.escalation_required ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                    <span className="ml-3 text-sm text-muted-foreground">
                      {limit.escalation_required ? "Yes" : "No"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Active</Label>
                  <div className="flex h-10 items-center">
                    <button
                      onClick={() => updateField(limit.id, "is_active", !limit.is_active)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${limit.is_active ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${limit.is_active ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                    <span className="ml-3 text-sm text-muted-foreground">
                      {limit.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
