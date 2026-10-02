"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMiniApp } from "@/lib/hr/telegram/miniapp-context";

// Shape matches getLeaveBalanceSummary's return type (apps/web/lib/hr/leave.ts).
interface LeaveBalance {
  leave_name: string;
  allocated_days: number;
  used_days: number;
  carried_over_days: number;
  remaining_days: number;
}

export default function LeaveBalancePage() {
  const { initData } = useMiniApp();
  const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchBalances = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/miniapp/leave/balance", {
        headers: { Authorization: `tma ${initData}` },
      });
      if (!res.ok) throw new Error("Request failed");
      const body = await res.json();
      setBalances(body.balances ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    fetchBalances();
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="px-1 text-lg font-semibold">Leave Balance</h1>

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-[var(--tg-hint-color)]">Couldn&apos;t load your leave balance.</p>
            <Button size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && balances && balances.length === 0 && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Wallet className="h-8 w-8 text-[var(--tg-hint-color)]" />
            <p className="text-sm text-[var(--tg-hint-color)]">No leave balance records found.</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && balances && balances.length > 0 && (
        <div className="flex flex-col gap-3">
          {balances.map((b) => (
            <Card key={b.leave_name} gradient={false}>
              <CardContent className="flex flex-col gap-2 py-1">
                <p className="text-sm font-medium">{b.leave_name}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-base font-semibold">{b.remaining_days}</p>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--tg-hint-color)]">Remaining</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold">{b.used_days}</p>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--tg-hint-color)]">Used</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold">{b.allocated_days}</p>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--tg-hint-color)]">Allocated</p>
                  </div>
                </div>
                {b.carried_over_days > 0 && (
                  <p className="text-xs text-[var(--tg-hint-color)]">
                    Includes {b.carried_over_days} carried-over day{b.carried_over_days !== 1 ? "s" : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
