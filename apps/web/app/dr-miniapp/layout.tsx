import type { Metadata } from "next";

// Daily Report Mini App: opened inside Telegram from the Daily Reporting bot.
// No dashboard chrome and no dashboard session; the page signs in with
// Telegram's initData. The Telegram bridge script is loaded by the page after
// hydration, because it writes style values onto <html> as soon as it runs.
export const metadata: Metadata = { title: "DCOS — Daily Report" };

export default function DrMiniAppLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-background text-foreground">{children}</main>;
}
