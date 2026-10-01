"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { COLOR_HEX } from "./constants";
import type { LeaveAdminController } from "./use-leave-admin";

export function LeaveTypesSection({ c }: { c: LeaveAdminController }) {
  const { activeSection, leaveTypes, openCreateType, openEditType, confirmDelete } = c;
  return (
    <>
      {activeSection === "leave_types" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{leaveTypes.length} leave type{leaveTypes.length !== 1 ? "s" : ""} configured</p>
            <Button onClick={openCreateType} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Leave Type
            </Button>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left font-medium py-3 px-4">Leave Type</th>
                  <th className="text-center font-medium py-3 px-4">Days/Year</th>
                  <th className="text-center font-medium py-3 px-4">Paid</th>
                  <th className="text-center font-medium py-3 px-4">Half-day</th>
                  <th className="text-center font-medium py-3 px-4">Carryover</th>
                  <th className="text-center font-medium py-3 px-4">Notice (d)</th>
                  <th className="text-center font-medium py-3 px-4">Gender</th>
                  <th className="text-center font-medium py-3 px-4">Status</th>
                  <th className="text-center font-medium py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((lt) => (
                  <tr key={lt.id} className="border-b border-border hover:bg-muted/30">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLOR_HEX[lt.color] ?? COLOR_HEX.blue }}
                        />
                        <div>
                          <p className="font-medium">{lt.leave_name}</p>
                          <p className="text-xs text-muted-foreground">{lt.leave_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">{lt.max_days_per_year || "—"}</td>
                    <td className="py-3 px-4 text-center">{lt.is_paid ? "✓" : "—"}</td>
                    <td className="py-3 px-4 text-center">{lt.half_day_allowed ? "✓" : "—"}</td>
                    <td className="py-3 px-4 text-center">
                      {lt.carryover_allowed
                        ? `✓ (max ${lt.max_carryover})${
                            lt.carryover_expiry_month && lt.carryover_expiry_day
                              ? ` · expires ${String(lt.carryover_expiry_month).padStart(2, "0")}/${String(lt.carryover_expiry_day).padStart(2, "0")}`
                              : ""
                          }`
                        : "—"}
                    </td>
                    <td className="py-3 px-4 text-center">{lt.advance_notice_days || "—"}</td>
                    <td className="py-3 px-4 text-center capitalize">{lt.gender_restriction === "all" ? "any" : lt.gender_restriction}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge className={`text-xs ${lt.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {lt.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditType(lt)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => confirmDelete(lt)}
                          className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
