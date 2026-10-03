"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { WbsBuilderColumn } from "./wbs-builder-types";

export type CellNav = "down" | "up" | "right" | "left" | "none";

interface WbsBuilderCellProps {
  column: WbsBuilderColumn;
  /** Raw string value for edit (and display unless `display` is given). */
  value: string;
  /** Shown instead of `value` when not editing (e.g. the full WBS code while the editor edits the own segment). */
  display?: string;
  /** Hover text when not editing. */
  hint?: string;
  editable: boolean;
  active: boolean;
  editing: boolean;
  /** Character typed to open the editor (replaces the value). Text cells only. */
  seed?: string;
  /** Bumped by the grid on every edit-session start so the input remounts fresh. */
  editKey?: number;
  onActivate: () => void;
  onStartEdit: () => void;
  onCommit: (raw: string, nav: CellNav) => void;
  onCancel: () => void;
}

export function WbsBuilderCell({
  column,
  value,
  display,
  hint,
  editable,
  active,
  editing,
  seed,
  editKey = 0,
  onActivate,
  onStartEdit,
  onCommit,
  onCancel,
}: WbsBuilderCellProps) {
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const doneRef = useRef(false);

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

  const options = column.options ?? [];
  const niceCase = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const fmtNumber = (v: string) => {
    const n = Number(v);
    return v !== "" && Number.isFinite(n)
      ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "";
  };
  const displayLabel = display ?? (
    column.variant === "select"
      ? (options.find((o) => o.value === value)?.label ?? (value ? niceCase(value) : ""))
      : column.variant === "number"
        ? fmtNumber(value)
        : value
  );

  if (editing && editable) {
    const common =
      "h-full w-full bg-white px-1.5 text-xs outline-none ring-2 ring-primary/60 rounded-[3px]";
    if (column.variant === "number") {
      return (
        <input
          key={`edit-${editKey}`}
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          min="0"
          step="0.01"
          defaultValue={seed ?? value}
          onKeyDown={handleKeyDown}
          onBlur={() => finish("none")}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(common, "text-right tabular-nums")}
        />
      );
    }
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
        key={`edit-${editKey}-${seed ?? ""}`}
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        defaultValue={seed ?? value}
        onKeyDown={handleKeyDown}
        onBlur={() => finish("none")}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(common, column.mono && "font-mono uppercase")}
      />
    );
  }

  return (
    <div
      role="gridcell"
      onMouseDown={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (editable) onStartEdit();
      }}
      className={cn(
        "flex h-full items-center truncate px-1.5 text-xs",
        column.mono && "font-mono",
        column.align === "right" && "justify-end tabular-nums",
        editable ? "cursor-cell" : "cursor-default text-muted-foreground",
        active && "rounded-[3px] bg-primary/5 ring-2 ring-inset ring-primary/70",
      )}
      title={hint ?? displayLabel}
    >
      <span className="truncate">
        {displayLabel ||
          (editable ? "" : column.variant === "number" ? "" : "—")}
      </span>
    </div>
  );
}
