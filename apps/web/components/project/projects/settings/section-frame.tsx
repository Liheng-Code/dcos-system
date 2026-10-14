"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** How a section is shown: on the Settings page, or as a step of the guided setup. */
export interface SectionMode {
  /** Guided setup: the button reads "Save and continue" and is enabled without changes. */
  guided?: boolean;
  onSaved?: () => void;
}

/**
 * Loads a section's value, tracks unsaved changes and saves it. Each Settings section saves on
 * its own, so a change in one never waits for, or overwrites, another.
 */
export function useSection<T>(load: () => Promise<T>, save: (value: T) => Promise<void>, mode: SectionMode = {}) {
  const [value, setValue] = useState<T | null>(null);
  const [saved, setSaved] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    load().then((v) => {
      if (!live) return;
      setValue(v);
      setSaved(v);
    });
    return () => { live = false; };
    // load is defined inline by each section and only depends on the project id it closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(() => value !== null && JSON.stringify(value) !== JSON.stringify(saved), [value, saved]);

  const submit = useCallback(async () => {
    if (value === null) return;
    setSaving(true);
    try {
      await save(value);
      setSaved(value);
      toast.success("Saved");
      mode.onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Not saved");
    } finally {
      setSaving(false);
    }
  }, [value, save, mode]);

  const patch = useCallback((p: Partial<T>) => setValue((v) => (v === null ? v : { ...v, ...p })), []);

  return { value, patch, setValue, dirty, saving, submit, reset: () => setValue(saved) };
}

export function SectionFrame({ id, title, description, mode = {}, dirty, saving, loading, onSave, onReset, children }: {
  id: string;
  title: string;
  description?: string;
  mode?: SectionMode;
  dirty: boolean;
  saving: boolean;
  loading: boolean;
  onSave: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-xl border border-border bg-card">
      {!mode.guided && (
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="px-5 py-4">
        {loading ? <div className="h-24 animate-pulse rounded-lg bg-muted" /> : children}
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
        {dirty && !mode.guided && <span className="mr-auto text-xs text-amber-600">Unsaved changes</span>}
        {dirty && !mode.guided && <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>Discard</Button>}
        <Button size="sm" onClick={onSave} disabled={loading || saving || (!dirty && !mode.guided)}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {mode.guided ? "Save and continue" : "Save"}
        </Button>
      </div>
    </section>
  );
}
