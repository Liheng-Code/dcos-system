"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { INV_STATUS_LABELS } from "./inv-types"

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  issued: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partially_issued: "bg-amber-50 text-amber-700 border-amber-200",
  under_inspection: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  in_transit: "bg-amber-50 text-amber-700 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  discrepancy: "bg-red-50 text-red-700 border-red-200",
  open: "bg-blue-50 text-blue-700 border-blue-200",
  counting: "bg-amber-50 text-amber-700 border-amber-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-blue-50 text-blue-700 border-blue-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // Returns
  inspected: "bg-amber-50 text-amber-700 border-amber-200",
  posted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  // Tools
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  disposed: "bg-gray-100 text-gray-600 border-gray-200",
  // Tool issues
  overdue: "bg-red-50 text-red-700 border-red-200",
  returned: "bg-emerald-50 text-emerald-700 border-emerald-200",
  damaged: "bg-red-50 text-red-700 border-red-200",
  lost: "bg-red-50 text-red-700 border-red-200",
}

export function InvStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", STATUS_CLASSES[status] ?? "bg-gray-100 text-gray-600 border-gray-200")}
    >
      {INV_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
