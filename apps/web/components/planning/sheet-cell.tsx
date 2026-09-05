"use client";

import { useEffect, useRef } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_OPTIONS, type SheetColumn } from "./sheet-types";

export type CellNav = "down" | "up" | "right" | "left" | "none";

interface SheetCellProps {
  column: SheetColumn;
  /** Raw string value for edit/display. */
  value: string;
  /** Formatted display string (falls back to `value`). */
  display?: string;
  editable: boolean;
  active: boolean;
  editing: boolean;
  /** Character typed to open the editor (replaces the value). */
  seed?: string;
  /** Bumped by the grid on every edit-session start so the input remounts fresh. */
  editKey?: number;
  /** Extra classes on the display cell (e.g. critical-path colouring). */
  className?: string;
  /**
   * Commit a value straight to this cell without entering edit mode — used by
   * the hover calendar button on date cells. `undefined` for non-date cells.
   */
  onPickValue?: (value: string) => void;
  onActivate: (mods?: { additive?: boolean; range?: boolean }) => void;
  onStartEdit: () => void;
  onCommit: (raw: string, nav: CellNav) => void;
  onCancel: () => void;
}

export function SheetCell({
  column,
  value,
  display,
  editable,
  active,
  editing,
  seed,
  editKey = 0,
  className,
  onPickValue,
  onActivate,
  onStartEdit,
  onCommit,
  onCancel,
}: SheetCellProps) {
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const doneRef = useRef(false);

  // Native date inputs only pop the calendar when the little icon is clicked;
  // open it wherever the field is clicked so "click the date → pick a date" works.
  const openPicker = (el: HTMLInputElement | HTMLSelectElement | null) => {
    if (el instanceof HTMLInputElement && el.type === "date") {
      try {
        el.showPicker();
      } catch {
        /* not supported / not a user gesture — ignore */
      }
    }
  };

  useEffect(() => {
    if (!editing) return;
    doneRef.current = false;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement && !seed) el.select();
  }, [editing, seed]);

  function finish(nav: CellNav) {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(inputRef.current?.value ?? value, nav);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      finish("down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      finish(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      doneRef.current = true;
      onCancel();
    }
  }

  const alignRight = column.align === "right";
  const initial = seed ?? value;
  const options = column.options ?? STATUS_OPTIONS;

  if (editing && editable && column.variant !== "icon") {
    const common =
      "h-full w-full bg-white px-1.5 text-xs outline-none ring-2 ring-primary/60 rounded-[3px]";
    if (column.variant === "select") {
      return (
        <select
          key={`edit-${editKey}`}
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          defaultValue={value || options[0]?.value}
          onKeyDown={handleKeyDown}
          onBlur={() => finish("none")}
          onMouseDown={(e) => e.stopPropagation()}
          className={common}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        key={`edit-${editKey}-${initial}`}
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={column.variant === "date" ? "date" : column.variant === "number" ? "number" : "text"}
        defaultValue={initial}
        min={column.field === "progress" ? 0 : column.field === "duration" ? 0 : undefined}
        max={column.field === "progress" ? 100 : undefined}
        onKeyDown={handleKeyDown}
        onBlur={() => finish("none")}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => openPicker(e.currentTarget)}
        className={cn(common, alignRight && "text-right", column.mono && "font-mono")}
      />
    );
  }

  const label =
    column.variant === "select"
      ? (options.find((o) => o.value === value)?.label ?? STATUS_LABELS[value] ?? value ?? "")
      : (display ?? value) || (editable ? "" : "—");

  const showCalendar = editable && column.variant === "date";

  return (
    <div
      role="gridcell"
      onMouseDown={(e) => {
        e.stopPropagation();
        onActivate({ additive: e.ctrlKey || e.metaKey, range: e.shiftKey });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        // Double-click edits this cell in place (spreadsheet style).
        if (editable && column.variant !== "icon") onStartEdit();
      }}
      className={cn(
        "group/cell relative flex h-full items-center truncate px-1.5 text-xs",
        alignRight ? "justify-end tabular-nums" : "justify-start",
        column.variant === "icon" && "justify-center px-0",
        column.mono && "font-mono text-[11px]",
        editable && column.variant !== "icon" ? "cursor-cell" : "cursor-default",
        !editable && column.variant !== "icon" && "text-muted-foreground",
        active && "rounded-[3px] bg-primary/5 ring-2 ring-inset ring-primary/70",
        className,
      )}
      title={display ?? value}
    >
      <span className="truncate">{label}</span>

      {/* Hover calendar affordance for date cells — click to pick a date without
          entering edit mode. Invisible & click-through until the row is hovered. */}
      {showCalendar && (
        <span
          className="pointer-events-none absolute inset-y-0 right-0 flex w-6 items-center justify-center opacity-0 transition-opacity group-hover/cell:pointer-events-auto group-hover/cell:opacity-100"
        >
          <CalendarDays className="pointer-events-none h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="date"
            aria-label={`Pick a ${column.label || "date"}`}
            value={value || ""}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openPicker(e.currentTarget);
            }}
            onChange={(e) => {
              if (e.target.value) onPickValue?.(e.target.value);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
      )}
    </div>
  );
}
