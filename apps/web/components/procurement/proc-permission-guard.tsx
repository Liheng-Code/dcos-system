"use client";

import { type ReactNode } from "react";
import { useProcurementPermissions, type ProcAction, type ProcPermField } from "./use-procurement-permissions";

interface Props {
  action: ProcAction;
  field: ProcPermField;
  fallback?: ReactNode;
  children: ReactNode;
}

export function ProcPermissionGuard({ action, field, fallback = null, children }: Props) {
  const { can } = useProcurementPermissions([action]);
  return can(action, field) ? <>{children}</> : <>{fallback}</>;
}
