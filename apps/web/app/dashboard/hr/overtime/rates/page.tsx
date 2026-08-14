"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Save } from "lucide-react";

interface Rate {
  id: string;
  ot_type: string;
  multiplier: number;
  effective_date: string;
  is_active: boolean;
}

const OT_TYPE_LABELS: Record<string, string> = {
  weekday: "Weekday",
  weekend: "Weekend",
  public_holiday: "Public Holiday",
  night_shift: "Night Shift",
  emergency: "Emergency",
  project_critical: "Project Critical",
};

export default function OTRatesPage() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hr/overtime/rates")
      .then((r) => r.json())
      .then((d) => { setRates(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const updateMultiplier = (id: string, value: string) => {
    setRates((prev) => prev.map((r) => r.id === id ? { ...r, multiplier: parseFloat(value) || 0 } : r));
  };

  const toggleActive = (id: string) => {
    setRates((prev) => prev.map((r) => r.id === id ? { ...r, is_active: !r.is_active } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    for (const rate of rates) {
      const res = await fetch("/api/hr/overtime/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rate.id, multiplier: rate.multiplier, is_active: rate.is_active }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }
    }

    setSuccess("Rates updated successfully");
    setSaving(false);
  };

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h1 className="text-2xl font-bold tracking-tight">OT Rates Configuration</h1>
          <p className="text-muted-foreground">Configure overtime rate multipliers by type</p>
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
        <CardHeader><CardTitle className="text-lg">Rate Multipliers</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {rates.map((rate) => (
              <div key={rate.id} className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-4">
                  <span className="w-36 text-sm font-medium">{OT_TYPE_LABELS[rate.ot_type] || rate.ot_type}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.25"
                      min="1.0"
                      max="5.0"
                      value={rate.multiplier}
                      onChange={(e) => updateMultiplier(rate.id, e.target.value)}
                      className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-center"
                    />
                    <span className="text-sm text-muted-foreground">×</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={rate.is_active ? "default" : "secondary"}>
                    {rate.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <button
                    onClick={() => toggleActive(rate.id)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rate.is_active ? "bg-primary" : "bg-muted"}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rate.is_active ? "translate-x-4.5 ml-0.5" : "translate-x-0.5 ml-0.5"}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
