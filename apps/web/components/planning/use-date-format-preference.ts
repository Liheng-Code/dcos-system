"use client";

// Resolves how dates should be DISPLAYED (never how they're edited — every
// date input in this app is a native <input type="date">, unaffected by this
// setting) across the Planning module: a per-user override, stored in
// `user_ui_preferences` under `date_display_format` (mirrors
// `use-column-preferences.ts`'s persistence shape), falling back to the
// company-wide `companies.date_format` default, falling back again to
// `DEFAULT_DATE_FORMAT_ID` if neither is set. Any read/write failure keeps
// the last-known-good value — a broken preference store must never break
// date rendering.

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_DATE_FORMAT_ID, formatDisplayDate, isKnownDateFormatId } from "@/lib/date-format";
import { getCompany, getUserUiPreferenceByUserIdAndPreferenceKey, upsertUserUiPreference } from "@/lib/planning/planning-queries";

const PREFERENCE_KEY = "date_display_format";

export interface UseDateFormatPreference {
  /** This user's own override, or null when they're using the company default. */
  formatId: string | null;
  /** The format actually in effect (user override, else company default, else the hardcoded fallback). */
  effectiveFormatId: string;
  /** The company-wide default, once loaded (null while loading). */
  companyDefaultId: string | null;
  setFormatId: (formatId: string) => void;
  resetToCompanyDefault: () => void;
  formatDate: (iso: string | null | undefined) => string;
  loading: boolean;
}

export function useDateFormatPreference(): UseDateFormatPreference {
  const [formatId, setFormatIdState] = useState<string | null>(null);
  const [companyDefaultId, setCompanyDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const userIdRef = useRef<string | null>(null);
  const formatIdRef = useRef<string | null>(formatId);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const [{ data: userData }, { data: companyRow }] = await Promise.all([
          supabase.auth.getUser(),
          getCompany(),
        ]);
        if (!alive) return;

        const companyDefault = isKnownDateFormatId(companyRow?.date_format)
          ? companyRow!.date_format
          : DEFAULT_DATE_FORMAT_ID;
        setCompanyDefaultId(companyDefault);

        const userId = userData?.user?.id ?? null;
        userIdRef.current = userId;
        if (!userId) return;

        const { data, error } = await getUserUiPreferenceByUserIdAndPreferenceKey(userId, PREFERENCE_KEY);
        if (!alive || error || !data) return;

        const value = (data as { value: unknown }).value as { formatId?: unknown } | null;
        const stored = isKnownDateFormatId(value?.formatId) ? (value!.formatId as string) : null;
        formatIdRef.current = stored;
        setFormatIdState(stored);
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

  const persist = useCallback(async (value: string | null) => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const supabase = createClient();
      await upsertUserUiPreference({
          user_id: userId,
          preference_key: PREFERENCE_KEY,
          value: { formatId: value },
          updated_at: new Date().toISOString(),
        });
    } catch {
      /* best-effort — a failed preference write must never break date display */
    }
  }, []);

  const setFormatId = useCallback(
    (next: string) => {
      formatIdRef.current = next;
      setFormatIdState(next);
      void persist(next);
    },
    [persist],
  );

  const resetToCompanyDefault = useCallback(() => {
    formatIdRef.current = null;
    setFormatIdState(null);
    void persist(null);
  }, [persist]);

  const effectiveFormatId = formatId ?? companyDefaultId ?? DEFAULT_DATE_FORMAT_ID;

  const formatDate = useCallback(
    (iso: string | null | undefined) => formatDisplayDate(iso, effectiveFormatId),
    [effectiveFormatId],
  );

  return {
    formatId,
    effectiveFormatId,
    companyDefaultId,
    setFormatId,
    resetToCompanyDefault,
    formatDate,
    loading,
  };
}
