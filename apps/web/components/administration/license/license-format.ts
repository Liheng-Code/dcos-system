import type { LicenseState } from "@/lib/licensing/effective";

export function formatLicenseDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const STATE_LABELS: Record<LicenseState, string> = {
  off: "Not enforced",
  unlicensed: "No valid license",
  active: "Active",
  expiring: "Expiring",
  grace: "Grace period",
  readonly: "Read-only",
  locked: "Locked",
  suspended: "Suspended",
  revoked: "Revoked",
};

export const STATE_TONES: Record<LicenseState, string> = {
  off: "bg-muted text-muted-foreground",
  unlicensed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  expiring: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  grace: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  readonly: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  locked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  suspended: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  revoked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};
