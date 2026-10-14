"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  id?: string;
  value?: string;
  organization_name?: string;
  label?: string;
  stakeholder_type?: string;
}

// Backward compatibility alias
export type StakeholderOption = DropdownOption;

interface StakeholderDropdownProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  addNewLabel?: string;
  onAddNew?: () => void;
  className?: string;
  disabled?: boolean;
}

export function StakeholderDropdown({
  id,
  value,
  onChange,
  options,
  placeholder = "— Select —",
  addNewLabel = "+ Add New",
  onAddNew,
  className,
  disabled = false,
}: StakeholderDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getOptionKey = (o: DropdownOption) => o.value ?? o.id ?? "";
  const getOptionLabel = (o: DropdownOption) => o.label ?? o.organization_name ?? "";

  const selectedOption = useMemo(
    () => options.find((o) => getOptionKey(o) === value),
    [options, value]
  );

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens (the search is cleared by the click that opens it)
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) =>
      getOptionLabel(o).toLowerCase().includes(q)
    );
  }, [options, search]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button resembling native select */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (!isOpen) setSearch("");
          setIsOpen(!isOpen);
        }}
        className={cn(
          "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-left flex items-center justify-between gap-2 outline-none transition-colors select-none",
          isOpen ? "border-primary ring-1 ring-primary" : "hover:border-border/80",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          className
        )}
      >
        <span className={cn("truncate block flex-1", !selectedOption && "text-muted-foreground")}>
          {selectedOption ? getOptionLabel(selectedOption) : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl border-border bg-popover animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden flex flex-col">
          {/* Search bar inside dropdown */}
          <div className="p-2 border-b border-border bg-muted/20">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-md border border-border bg-background pl-8 pr-7 py-1.5 text-xs outline-none focus:border-primary"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-border/20 text-xs">
            {/* Clear selection option */}
            <button
              type="button"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              className={cn(
                "w-full px-2.5 py-2 text-left rounded-md flex items-center justify-between text-muted-foreground hover:bg-muted/50 transition-colors",
                !value && "bg-muted font-medium text-foreground"
              )}
            >
              <span>{placeholder}</span>
              {!value && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const optKey = getOptionKey(opt);
                const optLabel = getOptionLabel(opt);
                const isSelected = optKey === value;
                return (
                  <button
                    key={optKey}
                    type="button"
                    onClick={() => {
                      onChange(optKey);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full px-2.5 py-2 text-left rounded-md flex items-center justify-between gap-2 hover:bg-muted/60 transition-colors",
                      isSelected && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <span className="truncate flex-1">{optLabel}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Bottom Button: + Add New */}
          {onAddNew && (
            <div className="p-1.5 border-t border-border bg-muted/40">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNew();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{addNewLabel}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
