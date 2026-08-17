"use client";

import { useRouter } from "next/navigation";
import { Bell, CalendarClock, CheckCheck, CircleCheck, ClipboardCheck, RotateCcw, Send, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WbsTaskAlertType } from "@/components/wbs/wbs-types";
import { useTaskAlerts } from "@/components/dashboard/task-alerts-provider";

function formatRelativeTime(iso: string) {
  const elapsed = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function alertIcon(type: WbsTaskAlertType) {
  const map: Record<WbsTaskAlertType, typeof Bell> = {
    task_assigned: ClipboardCheck,
    task_reassigned: RotateCcw,
    task_assignment_accepted: CircleCheck,
    task_assignment_rejected: XCircle,
    task_submitted: Send,
    task_approved: CircleCheck,
    task_rejected: XCircle,
    task_progress_updated: ClipboardCheck,
    task_overdue: Bell,
    leave_pending_approval: CalendarClock,
    leave_request_approved: CircleCheck,
    leave_request_rejected: XCircle,
  };
  return map[type];
}

const LEAVE_ALERT_TYPES = new Set(["leave_pending_approval", "leave_request_approved", "leave_request_rejected"]);

export function TaskAlertsMenu() {
  const router = useRouter();
  const { alerts, unreadCount, loading, markRead, markAllRead } = useTaskAlerts();

  async function openAlert(alert: { id: string; alert_type: string; wbs_task_id: string | null }) {
    await markRead(alert.id);
    if (alert.wbs_task_id) {
      router.push(`/dashboard/tasks/${alert.wbs_task_id}`);
    } else if (alert.alert_type === "leave_pending_approval") {
      router.push("/dashboard/hr/leave/approvals");
    } else if (LEAVE_ALERT_TYPES.has(alert.alert_type)) {
      router.push("/dashboard/hr/leave/my-requests");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">Task Alerts</p>
            <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
          </div>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-1">
          {loading && <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading alerts...</div>}
          {!loading && alerts.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No task alerts yet</div>
          )}
          {!loading && alerts.map((alert) => {
            const Icon = alertIcon(alert.alert_type);
            const unread = !alert.read_at;
            return (
              <DropdownMenuItem
                key={alert.id}
                onClick={() => void openAlert(alert)}
                className={cn("items-start gap-3 px-3 py-3", unread && "bg-blue-50/70")}
              >
                <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", unread ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium text-slate-700")}>{alert.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(alert.created_at)}</span>
                  </span>
                  {(alert.task_code || alert.task_name) && (
                    <span className="mt-0.5 block truncate text-xs font-medium text-slate-700">{alert.task_code} - {alert.task_name}</span>
                  )}
                  {alert.body && <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{alert.body}</span>}
                  {alert.actor_name && <span className="mt-1 block text-[10px] text-muted-foreground">From {alert.actor_name}</span>}
                </span>
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="px-3 py-2 text-[10px] text-muted-foreground">
          Alerts are created from task assignment, submit, approve, and reject actions.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
