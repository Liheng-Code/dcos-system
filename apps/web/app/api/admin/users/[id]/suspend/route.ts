import { createAccountStatusHandler } from "@/lib/admin-users/account-status-route-handler";

// POST /api/admin/users/[id]/suspend — F3, BR3.01. See account-status-route-handler.ts for logic.
export const POST = createAccountStatusHandler("suspend");
