// Single source of truth for the Account navigation layout (mirrors
// lib/procurement-nav.ts):
//   - The sidebar shows one flat item per group
//   - The Account header shows the group's child pages as tabs (see
//     app/dashboard/account/layout.tsx)
// Ledger/Payables/Receivables/Banking don't get their own sidebar buttons —
// their pages are still reachable, just as dropdown children under Overview,
// since the Overview page already renders the same content inline.

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type AccountTabItem = ModuleNavGroup["items"][number];
export type AccountGroup = ModuleNavGroup;

export const ACCOUNT_GROUPS: ModuleNavGroup[] = [
  {
    key: "overview",
    navKey: "group:account:overview",
    label: "Overview",
    href: "/dashboard/account",
    items: [
      {
        label: "Overview",
        href: "/dashboard/account",
        children: [
          { label: "Chart of Accounts", href: "/dashboard/account?sub=coa" },
          { label: "AP Invoices", href: "/dashboard/account?sub=ap" },
          { label: "AR Invoices", href: "/dashboard/account?sub=ar" },
          { label: "Payments", href: "/dashboard/account?sub=payments" },
          { label: "Journal Entries", href: "/dashboard/account?sub=journals" },
          { label: "General Ledger", href: "/dashboard/account?sub=gl" },
          { label: "Bank Accounts", href: "/dashboard/account?sub=bank" },
          { label: "Payment Runs", href: "/dashboard/account?sub=payment-runs" },
          { label: "Withholding Tax", href: "/dashboard/account?sub=wht" },
          { label: "Multi-Currency", href: "/dashboard/account/currencies" },
        ],
      },
    ],
  },
  {
    key: "reports",
    navKey: "group:account:reports",
    label: "Reports",
    href: "/dashboard/account/reports",
    items: [
      { label: "Reports", href: "/dashboard/account/reports" },
    ],
  },
];

export function getActiveAccountGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(ACCOUNT_GROUPS, pathname);
}
