"use client";

// Top-of-app license banners (design 9.2.1). Nothing renders unless the license
// is enforced and there is something to say.

import Link from "next/link";
import { AlertTriangle, Info, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLicense } from "@/contexts/license-context";
import { EXPIRING_ALL_USERS_DAYS, EXPIRING_DAYS } from "@/lib/licensing/effective";
import { formatLicenseDate } from "@/components/administration/license/license-format";

type Tone = "info" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  danger: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
};

export function LicenseBanner() {
  const { summary } = useLicense();
  if (!summary || !summary.enforced) return null;

  const admin = !!summary.admin;
  const messages: { tone: Tone; text: string }[] = [];
  const days = summary.daysToExpiry;

  switch (summary.state) {
    case "expiring":
      if (days !== null && (days <= EXPIRING_ALL_USERS_DAYS || (admin && days <= EXPIRING_DAYS))) {
        messages.push({
          tone: days <= EXPIRING_ALL_USERS_DAYS ? "warning" : "info",
          text: admin
            ? `The DCOS license expires in ${days} day${days === 1 ? "" : "s"} (${formatLicenseDate(summary.until)}). Request a renewal.`
            : `Your DCOS license expires on ${formatLicenseDate(summary.until)}. Contact your administrator.`,
        });
      }
      break;
    case "grace":
      messages.push({
        tone: "warning",
        text: `The DCOS license has expired. Full access continues until ${formatLicenseDate(summary.graceUntil)}, then data becomes read-only.`,
      });
      break;
    case "readonly":
      messages.push({
        tone: "danger",
        text: `Read-only: the DCOS license expired. You can view and export data until ${formatLicenseDate(summary.readonlyUntil)}.`,
      });
      break;
    case "suspended":
      messages.push({ tone: "danger", text: summary.notice ?? "This DCOS deployment is suspended." });
      break;
    case "locked":
    case "revoked":
      messages.push({ tone: "danger", text: "The DCOS license is no longer active. Only administrators can sign in to renew." });
      break;
    case "unlicensed":
      if (admin) messages.push({ tone: "danger", text: summary.admin?.tokenError ?? "No valid DCOS license is installed." });
      break;
  }

  if (admin) {
    const over = (
      [
        ["users", summary.limits.users],
        ["viewers", summary.limits.viewers],
        ["active projects", summary.limits.projects],
      ] as const
    ).filter(([, l]) => l.over);
    for (const [label, l] of over) {
      messages.push({
        tone: "warning",
        text: `${l.used} ${label}, the license allows ${l.limit}. Nothing is blocked, but new ${label} cannot be added until you are under the limit.`,
      });
    }
  }

  if (messages.length === 0) return null;

  return (
    <div className="shrink-0">
      {messages.map((m, i) => {
        const Icon = m.tone === "danger" ? Lock : m.tone === "warning" ? AlertTriangle : Info;
        return (
          <div key={i} className={cn("flex items-center gap-2 border-b px-4 py-2 text-sm", TONES[m.tone])}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{m.text}</span>
            {admin && (
              <Link href="/dashboard/administration/license" className="font-medium underline underline-offset-2">
                License
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
