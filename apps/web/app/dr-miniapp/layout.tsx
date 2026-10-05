import type { Metadata } from "next";
import Script from "next/script";

// Daily Report Mini App: opened inside Telegram from the Daily Reporting bot.
// No dashboard chrome and no dashboard session; the page signs in with
// Telegram's initData.
export const metadata: Metadata = { title: "DCOS — Daily Report" };

export default function DrMiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <main className="min-h-screen bg-background text-foreground">{children}</main>
    </>
  );
}
