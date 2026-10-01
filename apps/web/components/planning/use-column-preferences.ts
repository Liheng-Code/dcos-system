"use client";

// Persists the Planning ▸ Schedule grid's column order, visibility and widths
// per-user via `user_ui_preferences` (a small key/value table — see the
// migration for `schedule_grid_columns`). Mirrors the try/catch-to-default
// shape of `loadColWidths()` in sheet-types.ts: any read failure, missing
// row, or unauthenticated user falls back to the shipped defaults so a
// preference-store outage can never break the grid.

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_COLUMN_ORDER,
  DEFAULT_COLUMN_VISIBILITY,
  DEFAULT_COL_WIDTHS,
  MIN_COL_WIDTH,
  SHEET_COLUMNS,
  type ColWidths,
  type ColumnOrder,
  type ColumnVisibility,
  type SheetField,
} from "./sheet-types";
import { getUserUiPreferenceByUserIdAndPreferenceKey, upsertUserUiPreference } from "@/lib/planning/planning-queries";

const PREFERENCE_KEY = "schedule_grid_columns";
/** Width edits fire on every mousemove during a drag — debounce the write so a resize doesn't spam the network. */
const WIDTH_WRITE_DEBOUNCE_MS = 400;

interface StoredPreferences {
  order: ColumnOrder;
  visibility: ColumnVisibility;
  widths: ColWidths;
}

const DEFAULT_PREFERENCES: StoredPreferences = {
  order: DEFAULT_COLUMN_ORDER,
  visibility: DEFAULT_COLUMN_VISIBILITY,
  widths: DEFAULT_COL_WIDTHS,
};

function sanitizeOrder(raw: unknown): ColumnOrder {
  const valid = new Set<SheetField>(DEFAULT_COLUMN_ORDER);
  const seen = new Set<SheetField>();
  const out: SheetField[] = [];
  if (Array.isArray(raw)) {
    for (const f of raw) {
      if (typeof f === "string" && valid.has(f as SheetField) && !seen.has(f as SheetField)) {
        seen.add(f as SheetField);
        out.push(f as SheetField);
      }
    }
  }
  // Append any field missing from a stale stored order (e.g. a column shipped later).
  for (const f of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(f)) out.push(f);
  }
  return out;
}

function sanitizeVisibility(raw: unknown): ColumnVisibility {
  const next = { ...DEFAULT_COLUMN_VISIBILITY };
  if (raw && typeof raw === "object") {
    for (const c of SHEET_COLUMNS) {
      const v = (raw as Record<string, unknown>)[c.field];
      if (typeof v === "boolean") next[c.field] = v;
    }
  }
  return next;
}

function sanitizeWidths(raw: unknown): ColWidths {
  const next = { ...DEFAULT_COL_WIDTHS };
  if (raw && typeof raw === "object") {
    for (const c of SHEET_COLUMNS) {
      const v = (raw as Record<string, unknown>)[c.field];
      if (typeof v === "number" && v >= MIN_COL_WIDTH) next[c.field] = v;
    }
  }
  return next;
}

function parsePreferences(value: unknown): StoredPreferences {
  try {
    if (!value || typeof value !== "object") return DEFAULT_PREFERENCES;
    const v = value as Record<string, unknown>;
    return {
      order: sanitizeOrder(v.order),
      visibility: sanitizeVisibility(v.visibility),
      widths: sanitizeWidths(v.widths),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export interface UseColumnPreferences {
  order: ColumnOrder;
  visibility: ColumnVisibility;
  widths: ColWidths;
  setOrder: (order: ColumnOrder) => void;
  setVisibility: (visibility: ColumnVisibility) => void;
  /** Updates local widths immediately (smooth drag feedback); the network write is debounced. */
  setWidths: (widths: ColWidths | ((prev: ColWidths) => ColWidths)) => void;
  resetToDefault: () => void;
  loading: boolean;
}

export function useColumnPreferences(): UseColumnPreferences {
  const [prefs, setPrefs] = useState<StoredPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  const userIdRef = useRef<string | null>(null);
  // Always holds the latest committed preferences, updated synchronously (not
  // via effect) so back-to-back setOrder/setVisibility/setWidths calls in the
  // same tick each merge onto the truly-current value rather than a stale one.
  const prefsRef = useRef(prefs);
  const widthWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id ?? null;
        if (!alive) return;
        userIdRef.current = userId;
        if (!userId) return;

        const { data, error } = await getUserUiPreferenceByUserIdAndPreferenceKey(userId, PREFERENCE_KEY);
        if (!alive || error || !data) return;

        const parsed = parsePreferences((data as { value: unknown }).value);
        prefsRef.current = parsed;
        setPrefs(parsed);
      } catch {
        /* keep defaults */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (widthWriteTimer.current) clearTimeout(widthWriteTimer.current);
    },
    [],
  );

  const persist = useCallback(async (value: StoredPreferences) => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const supabase = createClient();
      await upsertUserUiPreference({
          user_id: userId,
          preference_key: PREFERENCE_KEY,
          value,
          updated_at: new Date().toISOString(),
        });
    } catch {
      /* best-effort — a failed preference write must never break the grid */
    }
  }, []);

  const setOrder = useCallback(
    (order: ColumnOrder) => {
      const updated = { ...prefsRef.current, order };
      prefsRef.current = updated;
      setPrefs(updated);
      void persist(updated);
    },
    [persist],
  );

  const setVisibility = useCallback(
    (visibility: ColumnVisibility) => {
      const updated = { ...prefsRef.current, visibility };
      prefsRef.current = updated;
      setPrefs(updated);
      void persist(updated);
    },
    [persist],
  );

  const setWidths = useCallback(
    (next: ColWidths | ((prev: ColWidths) => ColWidths)) => {
      const widths = typeof next === "function" ? next(prefsRef.current.widths) : next;
      const updated = { ...prefsRef.current, widths };
      prefsRef.current = updated;
      setPrefs(updated);
      if (widthWriteTimer.current) clearTimeout(widthWriteTimer.current);
      widthWriteTimer.current = setTimeout(() => {
        widthWriteTimer.current = null;
        void persist(prefsRef.current);
      }, WIDTH_WRITE_DEBOUNCE_MS);
    },
    [persist],
  );

  const resetToDefault = useCallback(() => {
    if (widthWriteTimer.current) {
      clearTimeout(widthWriteTimer.current);
      widthWriteTimer.current = null;
    }
    prefsRef.current = DEFAULT_PREFERENCES;
    setPrefs(DEFAULT_PREFERENCES);
    void persist(DEFAULT_PREFERENCES);
  }, [persist]);

  return {
    order: prefs.order,
    visibility: prefs.visibility,
    widths: prefs.widths,
    setOrder,
    setVisibility,
    setWidths,
    resetToDefault,
    loading,
  };
}
