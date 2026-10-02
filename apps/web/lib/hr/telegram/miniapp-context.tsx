"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MiniAppProfile {
  id: string;
  fullName: string | null;
  employeeId: string | null;
}

interface MiniAppContextValue {
  profile: MiniAppProfile | null;
  initData: string;
  loading: boolean;
  error: string | null;
}

const MiniAppContext = createContext<MiniAppContextValue | null>(null);

/**
 * Gives Mini App pages the authenticated profile plus the raw `initData`
 * string, so child pages don't each need to re-read
 * `window.Telegram.WebApp.initData` — they just forward `initData` as the
 * `Authorization: tma <initData>` header on their own fetches.
 */
export function useMiniApp(): MiniAppContextValue {
  const ctx = useContext(MiniAppContext);
  if (!ctx) {
    throw new Error("useMiniApp must be used within a MiniAppProvider");
  }
  return ctx;
}

type BootstrapState =
  | { status: "loading" }
  | { status: "ready"; profile: MiniAppProfile; initData: string }
  | { status: "not_linked" }
  | { status: "network_error" };

export function MiniAppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BootstrapState>({ status: "loading" });
  const [retryKey, setRetryKey] = useState(0);

  const bootstrap = useCallback(async () => {
    // Outside Telegram's WebView (e.g. opened directly in a browser during
    // dev) `window.Telegram.WebApp.initData` is empty. We still call the
    // session endpoint with whatever we have — the backend will reject an
    // empty/invalid initData with a 401/403, which we treat the same as
    // "not linked" so this renders sensibly outside Telegram too.
    const initData = window.Telegram?.WebApp?.initData ?? "";

    try {
      const res = await fetch("/api/telegram/miniapp/session", {
        method: "POST",
        headers: { Authorization: `tma ${initData}` },
      });
      const body = await res.json();

      if (body.linked) {
        setState({ status: "ready", profile: body.profile, initData });
      } else {
        setState({ status: "not_linked" });
      }
    } catch {
      setState({ status: "network_error" });
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap, retryKey]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--tg-button-color,#3b82f6)]" />
      </div>
    );
  }

  if (state.status === "not_linked") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-sm text-[var(--tg-hint-color,#6b7280)]">
          Your Telegram account isn&apos;t linked yet. Open a chat with the bot and send /link to connect your
          account.
        </p>
      </div>
    );
  }

  if (state.status === "network_error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-[var(--tg-hint-color,#6b7280)]">
          Couldn&apos;t connect. Check your connection and try again.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setState({ status: "loading" });
            setRetryKey((k) => k + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <MiniAppContext.Provider value={{ profile: state.profile, initData: state.initData, loading: false, error: null }}>
      {/* Persistent identity bar — makes it obvious which linked account is
          driving the session, since there's otherwise no login screen or
          account switcher to make that visible. */}
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-[var(--tg-secondary-bg-color,#f3f4f6)] bg-[var(--tg-bg-color)] px-4 py-1.5 text-xs text-[var(--tg-hint-color,#6b7280)]">
        <User className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {state.profile.fullName ?? "Telegram user"}
          {state.profile.employeeId ? ` · ${state.profile.employeeId}` : ""}
        </span>
      </div>
      {children}
    </MiniAppContext.Provider>
  );
}
