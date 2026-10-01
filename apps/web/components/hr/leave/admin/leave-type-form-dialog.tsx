"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Toggle } from "./toggle";
import { COLOR_OPTIONS, COLOR_HEX, ROUNDING_RULE_OPTIONS, inputCls, labelCls } from "./constants";
import type { LeaveTypeForm } from "@/lib/hr/leave-admin-types";
import type { LeaveAdminController } from "./use-leave-admin";

export function LeaveTypeFormDialog({ c }: { c: LeaveAdminController }) {
  const { leaveTypes, showTypeForm, setShowTypeForm, editingType, typeForm, typeSaving, typeError, saveType, set } = c;
  return (
    <>
      {showTypeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative bg-background rounded-xl shadow-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background rounded-t-xl z-10">
              <h3 className="text-base font-semibold">
                {editingType ? "Edit leave type" : "Add leave type"}
              </h3>
              <button
                onClick={() => setShowTypeForm(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

              {/* Row: Name | Color */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Name</label>
                  <input
                    className={inputCls}
                    value={typeForm.leave_name}
                    onChange={(e) => set("leave_name", e.target.value)}
                    placeholder="e.g. Annual Leave"
                  />
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full flex-shrink-0 border border-border"
                      style={{ backgroundColor: COLOR_HEX[typeForm.color] ?? COLOR_HEX.blue }}
                    />
                    <select
                      className={cn(inputCls, "flex-1")}
                      value={typeForm.color}
                      onChange={(e) => set("color", e.target.value)}
                    >
                      {COLOR_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Row: Code (left only, readonly when editing) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Code</label>
                  <input
                    className={inputCls}
                    value={typeForm.leave_code}
                    onChange={(e) => set("leave_code", e.target.value.toUpperCase())}
                    placeholder="e.g. ANNUAL"
                    disabled={!!editingType}
                  />
                </div>
              </div>

              {/* Row: Days per year | Carry-forward max */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Days per year</label>
                  <input
                    type="number" min={0}
                    className={inputCls}
                    value={typeForm.max_days_per_year}
                    onChange={(e) => set("max_days_per_year", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Carry-forward max</label>
                  <input
                    type="number" min={0}
                    className={inputCls}
                    value={typeForm.max_carryover}
                    onChange={(e) => set("max_carryover", Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Row: Max days per request | Advance notice */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Max days per request</label>
                  <input
                    type="number" min={0}
                    className={inputCls}
                    value={typeForm.max_days_per_request}
                    onChange={(e) => set("max_days_per_request", Number(e.target.value))}
                    placeholder="0 = unlimited"
                  />
                </div>
                <div>
                  <label className={labelCls}>Advance notice (days)</label>
                  <input
                    type="number" min={0}
                    className={inputCls}
                    value={typeForm.advance_notice_days}
                    onChange={(e) => set("advance_notice_days", Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Row: Rounding rule | Carryover expiry */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Rounding Rule</label>
                  <select
                    className={inputCls}
                    value={typeForm.rounding_rule}
                    onChange={(e) => set("rounding_rule", e.target.value)}
                  >
                    {ROUNDING_RULE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                {typeForm.carryover_allowed && (
                  <div>
                    <label className={labelCls}>Carryover Expiry</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} max={12}
                        className={inputCls}
                        placeholder="Month"
                        value={typeForm.carryover_expiry_month ?? ""}
                        onChange={(e) => set("carryover_expiry_month", e.target.value === "" ? null : Number(e.target.value))}
                      />
                      <input
                        type="number" min={1} max={31}
                        className={inputCls}
                        placeholder="Day"
                        value={typeForm.carryover_expiry_day ?? ""}
                        onChange={(e) => set("carryover_expiry_day", e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Leave blank for no expiry</p>
                  </div>
                )}
              </div>

              {/* Cancel window — full width */}
              <div>
                <label className={labelCls}>Cancel window (days after submission)</label>
                <input
                  type="number" min={0}
                  className={inputCls}
                  value={typeForm.cancel_window_days}
                  onChange={(e) => set("cancel_window_days", Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Employees can request cancellation within this many days after submitting the leave request. Set 0 to disable.
                </p>
              </div>

              {/* Row: Gender restriction | Deduct from */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Gender restriction</label>
                  <select
                    className={inputCls}
                    value={typeForm.gender_restriction}
                    onChange={(e) => set("gender_restriction", e.target.value)}
                  >
                    <option value="all">any</option>
                    <option value="male">male</option>
                    <option value="female">female</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Deduct from</label>
                  <select
                    className={inputCls}
                    value={typeForm.deduct_from_type_id ?? ""}
                    onChange={(e) => set("deduct_from_type_id", e.target.value || null)}
                  >
                    <option value="">balance</option>
                    {leaveTypes
                      .filter((lt) => lt.id !== editingType?.id)
                      .map((lt) => (
                        <option key={lt.id} value={lt.id}>{lt.leave_name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Toggle switches — 2-column grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 pt-1">
                {(
                  [
                    ["probation_required",  "Probation required"],
                    ["requires_document",   "Document required"],
                    ["half_day_allowed",    "Half-day allowed"],
                    ["skip_team_capacity",  "Skip capacity check"],
                    ["monthly_accrual",     "Monthly accrual"],
                    ["seniority_based",     "Seniority based"],
                    ["is_replacement_leave","Replacement leave"],
                    ["is_paid",             "Paid"],
                  ] as [keyof LeaveTypeForm, string][]
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{label}</span>
                    <Toggle
                      checked={typeForm[key] as boolean}
                      onChange={(v) => set(key, v as LeaveTypeForm[typeof key])}
                    />
                  </div>
                ))}

                {/* Active — single item spanning left col */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Active</span>
                  <Toggle
                    checked={typeForm.is_active}
                    onChange={(v) => set("is_active", v)}
                  />
                </div>
              </div>

              {/* Error */}
              {typeError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {typeError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border sticky bottom-0 bg-background rounded-b-xl">
              <Button variant="outline" onClick={() => setShowTypeForm(false)}>Cancel</Button>
              <Button onClick={saveType} disabled={typeSaving}>
                {typeSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
