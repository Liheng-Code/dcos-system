"use client";

// Module 10-01 Daily Reporting — Telegram Mini App entry (design §7.3, §12.2).
// Opened from the "Submit Daily Report" button the Daily Reporting bot pins in
// a project group. The launch token travels in the start parameter inside
// Telegram's signed initData; the server turns it into a session for that one
// reporting unit. The form is the same one the dashboard and the Field App use.

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrReportForm } from "@/components/construction/daily-reporting/dr-report-form";
import { setApiAuthorization } from "@/lib/construction/daily-reporting/service";

interface Session {
  unit: { id: string; code: string; name: string };
  report_date: string;
}

type State =
  | { status: "loading" }
  | { status: "ready"; session: Session }
  | { status: "refused"; message: string }
  | { status: "done"; sent: boolean };

export default function DailyReportMiniAppPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    // Outside Telegram initData is empty and the server refuses it.
    const initData = webApp?.initData ?? "";

    fetch("/api/dr/telegram/session", { method: "POST", headers: { Authorization: `tma ${initData}` } })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "refused", message: body.error ?? "The report could not be opened." });
          return;
        }
        setApiAuthorization(`Bearer ${body.token}`);
        setState({ status: "ready", session: { unit: body.unit, report_date: body.report_date } });
      })
      .catch(() => !cancelled && setState({ status: "refused", message: "No connection. Check your signal and try again." }));
    return () => {
      cancelled = true;
      setApiAuthorization(null);
    };
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.status === "refused") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm">{state.message}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (state.status === "done") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        {state.sent ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : null}
        <p className="text-sm">{state.sent ? "Your daily report was sent for review." : "Nothing was sent."}</p>
        <Button size="sm" onClick={() => window.Telegram?.WebApp?.close()}>
          Close
        </Button>
      </div>
    );
  }

  const { unit, report_date } = state.session;
  return (
    <div className="space-y-3 p-3">
      <div>
        <h1 className="text-base font-semibold">Daily report</h1>
        <p className="text-xs text-muted-foreground">
          {unit.code} {unit.name} · {report_date}
        </p>
      </div>
      <DrReportForm
        unitId={unit.id}
        date={report_date}
        mode="new"
        retryWhenOnline
        onDone={() => setState({ status: "done", sent: true })}
        onCancel={() => setState({ status: "done", sent: false })}
      />
    </div>
  );
}
