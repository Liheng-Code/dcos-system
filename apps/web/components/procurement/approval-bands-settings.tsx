"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listApprovalBands, setApprovalBands } from "@/lib/procurement/procurement-queries";
import { validateBands, MAX_BAND } from "@/lib/procurement/approval-bands";
import { procErrorMessage } from "@/lib/procurement/procurement-transitions";
import { FxRatesSection } from "@/components/procurement/fx-rates-section";
import { useProcurementPermissions } from "@/components/procurement/use-procurement-permissions";

interface BandRow {
  band: number;
  label: string;
  /** Text so the user can type freely; unused for the open-ended top band. */
  max_text: string;
  permission_action: string;
}

function parseAmount(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text.replace(/,/g, ""));
}

export function ApprovalBandsSettings() {
  const { can, loading: permLoading } = useProcurementPermissions(["po"]);
  const [rows, setRows] = useState<BandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback(({ data, error: err }: Awaited<ReturnType<typeof listApprovalBands>>) => {
    if (err || !data) {
      setError(err ? procErrorMessage(err) : "Failed to load approval bands");
    } else {
      setError(null);
      setRows(data.map(b => ({
        band: b.band,
        label: b.label,
        max_text: b.max_amount === null ? "" : String(b.max_amount),
        permission_action: b.permission_action,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    listApprovalBands().then(r => { if (active) apply(r); });
    return () => { active = false; };
  }, [apply]);

  function reload() {
    setLoading(true);
    void listApprovalBands().then(apply);
  }

  const canConfigure = can("po", "configure");

  // A band starts where the previous one ends, so the minimum is derived, which keeps the bands contiguous.
  const effective = rows.map((r, i) => ({
    ...r,
    min_amount: i === 0 ? 0 : parseAmount(rows[i - 1].max_text),
    max_amount: r.band === MAX_BAND ? null : parseAmount(r.max_text),
  }));

  const validation = (() => {
    if (effective.some(r => r.band < MAX_BAND && Number.isNaN(r.max_amount))) return "Enter a maximum for bands 1 to 4.";
    return validateBands(effective.map(r => ({
      band: r.band,
      min_amount: r.min_amount,
      max_amount: r.max_amount === null || Number.isNaN(r.max_amount) ? null : r.max_amount,
    })));
  })();

  function update(band: number, patch: Partial<BandRow>) {
    setRows(prev => prev.map(r => (r.band === band ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (validation) { toast.error(validation); return; }
    setSaving(true);
    const { error: err } = await setApprovalBands(effective.map(r => ({
      band: r.band,
      label: r.label.trim() || undefined,
      min_amount: r.min_amount,
      max_amount: r.max_amount,
    })));
    setSaving(false);
    if (err) { toast.error(procErrorMessage(err)); return; }
    toast.success("Approval bands saved");
    reload();
  }

  if (loading || permLoading) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-5 flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-red-600">{error}</p>
          <Button size="sm" variant="outline" onClick={reload}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0 || !can("po", "view")) {
    return (
      <Card>
        <CardContent className="pt-5 py-10 text-center text-sm text-muted-foreground">
          You don&apos;t have access to approval bands.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
    <Card>
      <CardContent className="pt-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          A PO is approved by someone who holds the permission of its band or a higher one. Amounts are in the base
          currency; a band holds amounts above its minimum up to and including its maximum. A PO with an award
          override, a single source or an over-budget flag needs one band higher (up to band 5).
        </p>
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 dark:border-amber-500/30">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Changes to approval bands are recorded in the audit log as critical.</span>
        </div>
        {!canConfigure && (
          <p className="text-xs text-muted-foreground">
            You can view the bands. Changing them needs the Procurement PO configure permission.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-16">Band</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Label</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Above</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Up to (max)</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Approved by holders of</th>
              </tr>
            </thead>
            <tbody>
              {effective.map(r => (
                <tr key={r.band} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{r.band}</td>
                  <td className="px-3 py-2">
                    <Input className="h-8" value={r.label} disabled={!canConfigure || saving} onChange={e => update(r.band, { label: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {Number.isNaN(r.min_amount) ? "-" : r.min_amount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.band === MAX_BAND ? (
                      <span className="text-muted-foreground">No limit</span>
                    ) : (
                      <Input
                        className="h-8 w-40 ml-auto text-right"
                        type="number"
                        min="0"
                        step="any"
                        value={r.max_text}
                        disabled={!canConfigure || saving}
                        onChange={e => update(r.band, { max_text: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.permission_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {validation && canConfigure && <p className="text-sm text-red-600">{validation}</p>}

        {canConfigure && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reload} disabled={saving}>Reset</Button>
            <Button onClick={() => void save()} disabled={saving || validation != null} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save bands
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
    <FxRatesSection canConfigure={canConfigure} />
    </div>
  );
}
