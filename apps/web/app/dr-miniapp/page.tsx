"use client";

// Module 10-01 Daily Reporting — Telegram Mini App entry (design §7.3, §12.2).
// Opened from the "Submit Daily Report" button the Daily Reporting bot pins in
// a project group. The launch token travels in the start parameter inside
// Telegram's signed initData; the server turns it into a session for that one
// reporting unit. The reporter does everything here: today's report, the
// correction of a returned report, and the answer to a question from the PM.

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrReportForm } from "@/components/construction/daily-reporting/dr-report-form";
import { DrMiniForm } from "@/components/construction/daily-reporting/miniapp/dr-mini-form";
import { setApiAuthorization } from "@/lib/construction/daily-reporting/service";

interface Session {
  unit: { id: string; code: string; name: string };
  report_date: string;
}

const TELEGRAM_SCRIPT = "https://telegram.org/js/telegram-web-app.js";

/** Loads Telegram's bridge script once. Resolves either way: outside Telegram the page still works as a preview. */
function loadTelegramBridge(): Promise<void> {
  if (window.Telegram?.WebApp) return Promise.resolve();
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TELEGRAM_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => resolve(), { once: true });
    if (!existing) {
      script.src = TELEGRAM_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
    // Never wait on Telegram's server for long.
    setTimeout(resolve, 4000);
  });
}

type State =
  | { status: "loading" }
  | { status: "ready"; session: Session; correcting: boolean }
  | { status: "refused"; message: string }
  | { status: "done"; reportNo: string | null };

export default function DailyReportMiniAppPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      await loadTelegramBridge();
      if (cancelled) return;
      const webApp = window.Telegram?.WebApp;
      webApp?.ready();
      webApp?.expand();
      const initData = webApp?.initData ?? "";

      // Outside Telegram there is no initData. Someone signed in to DCOS can
      // still open the same short form in a browser with ?unit=<id> (and
      // optionally &date=yyyy-mm-dd); the gateway then uses their own session
      // and permissions, exactly as the website does.
      const query = new URLSearchParams(window.location.search);
      const unitParam = query.get("unit");
      if (!initData && unitParam && /^[0-9a-f-]{36}$/i.test(unitParam)) {
        const dateParam = query.get("date");
        const today = new Intl.DateTimeFormat("en-CA").format(new Date());
        setState({
          status: "ready",
          session: { unit: { id: unitParam, code: "", name: "" }, report_date: dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today },
          correcting: false,
        });
        return;
      }

      try {
        const res = await fetch("/api/dr/telegram/session", { method: "POST", headers: { Authorization: `tma ${initData}` } });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "refused", message: body.error ?? "The report could not be opened." });
          return;
        }
        setApiAuthorization(`Bearer ${body.token}`);
        setState({ status: "ready", session: { unit: body.unit, report_date: body.report_date }, correcting: false });
      } catch {
        if (!cancelled) setState({ status: "refused", message: "No connection. Check your signal and try again." });
      }
    }

    void start();
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
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-sm">
          {state.reportNo ? <span className="font-semibold">{state.reportNo}</span> : "Your report"} was sent to the project manager for
          review.
        </p>
        <Button size="sm" onClick={() => window.Telegram?.WebApp?.close()}>
          Close
        </Button>
      </div>
    );
  }

  const { session } = state;
  if (state.correcting) {
    // Returned report: the full form locks everything except the returned items.
    return (
      <div className="space-y-3 p-3">
        <DrReportForm
          unitId={session.unit.id}
          date={session.report_date}
          mode="correct"
          retryWhenOnline
          onDone={() => setState({ status: "done", reportNo: null })}
          onCancel={() => setState({ ...state, correcting: false })}
        />
      </div>
    );
  }

  return (
    <DrMiniForm
      unitId={session.unit.id}
      date={session.report_date}
      onDone={(reportNo) => setState({ status: "done", reportNo })}
      onCorrect={() => setState({ ...state, correcting: true })}
    />
  );
}
