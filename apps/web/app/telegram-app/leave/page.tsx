import Link from "next/link";
import { CalendarPlus, ClipboardCheck, ListChecks, Wallet, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LeaveMenuTile {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const TILES: LeaveMenuTile[] = [
  {
    href: "/telegram-app/leave/apply",
    label: "Apply for Leave",
    description: "Submit a new leave request",
    icon: CalendarPlus,
  },
  {
    href: "/telegram-app/leave/my-requests",
    label: "My Requests",
    description: "View your leave request history",
    icon: ListChecks,
  },
  {
    href: "/telegram-app/leave/balance",
    label: "Balance",
    description: "Check your remaining leave balance",
    icon: Wallet,
  },
  {
    href: "/telegram-app/leave/approvals",
    label: "Pending Approvals",
    description: "Review requests awaiting your decision",
    icon: ClipboardCheck,
  },
];

function MenuTile({ tile }: { tile: LeaveMenuTile }) {
  const Icon = tile.icon;
  const content = (
    <Card gradient={false} className={cn(!tile.disabled && "active:bg-[var(--tg-secondary-bg-color)]")}>
      <CardContent className="flex items-center gap-3 py-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tg-secondary-bg-color)]">
          <Icon className="h-4.5 w-4.5 text-[var(--tg-button-color)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{tile.label}</p>
          <p className="text-xs text-[var(--tg-hint-color)]">{tile.description}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (tile.disabled) {
    return <div className="opacity-50">{content}</div>;
  }

  return (
    <Link href={tile.href} className="block">
      {content}
    </Link>
  );
}

export default function LeaveMenuPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="px-1 text-lg font-semibold">Leave</h1>
      {TILES.map((tile) => (
        <MenuTile key={tile.href} tile={tile} />
      ))}
    </div>
  );
}
