import { createAccountStatusHandler } from "@/lib/admin-users/account-status-route-handler";

// POST /api/admin/users/[id]/unlock — F3, BR3.04. See account-status-route-handler.ts for logic.
export const POST = createAccountStatusHandler("unlock");
