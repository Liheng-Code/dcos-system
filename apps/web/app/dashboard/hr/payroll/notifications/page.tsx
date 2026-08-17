"use client";

import { PayrollNotificationsList } from "@/components/hr/payroll/payroll-notifications-list";

export default function PayrollNotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
        <p className="text-muted-foreground text-sm">Payroll workflow activity and status updates</p>
      </div>

      <PayrollNotificationsList />
    </div>
  );
}
