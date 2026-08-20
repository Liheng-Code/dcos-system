"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { MiniAppProvider } from "@/lib/telegram/miniapp-context";

// Light-mode fallbacks used when this page is opened outside Telegram's
// WebView (e.g. directly in a browser during dev), where
// `Telegram.WebApp.themeParams` is empty/undefined. Keyed by Telegram's
// themeParams field names.
const THEME_FALLBACKS: Record<string, string> = {
  bg_color: "#ffffff",
  text_color: "#111111",
  hint_color: "#6b7280",
  button_color: "#3b82f6",
  button_text_color: "#ffffff",
  secondary_bg_color: "#f3f4f6",
};

const THEME_CSS_VARS: Record<string, string> = {
  bg_color: "--tg-bg-color",
  text_color: "--tg-text-color",
  hint_color: "--tg-hint-color",
  button_color: "--tg-button-color",
  button_text_color: "--tg-button-text-color",
  secondary_bg_color: "--tg-secondary-bg-color",
};

// Rendered (and available on first paint, server + client) so there is never
// a flash of unstyled content while we wait to hear from Telegram.
const fallbackStyle = Object.fromEntries(
  Object.entries(THEME_FALLBACKS).map(([key, value]) => [THEME_CSS_VARS[key], value]),
) as React.CSSProperties;

/**
 * Chromeless root layout for the /telegram-app route group. This is a
 * Telegram Mini App surface, not the DCOS dashboard — no sidebar, no header,
 * nothing from app/dashboard/layout.tsx. It only: loads the Telegram WebApp
 * bridge script, calls ready()/expand(), mirrors Telegram's theme onto CSS
 * custom properties, and gates children behind the Mini App auth bootstrap.
 */
export default function TelegramAppLayout({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    webApp.ready();
    webApp.expand();

    // Applied by directly mutating the DOM node's style, not via React
    // state — this is a one-time sync from an external system (Telegram),
    // not something the rest of the component needs to react to.
    const node = rootRef.current;
    const params = webApp.themeParams ?? {};
    if (!node) return;
    for (const [key, cssVar] of Object.entries(THEME_CSS_VARS)) {
      const value = params[key];
      if (value) node.style.setProperty(cssVar, value);
    }
  }, []);

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div
        ref={rootRef}
        style={fallbackStyle}
        className="min-h-screen bg-[var(--tg-bg-color)] text-[var(--tg-text-color)]"
      >
        <MiniAppProvider>{children}</MiniAppProvider>
      </div>
    </>
  );
}
