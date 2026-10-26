import { useEffect, useState, useCallback } from "react";
import { LibraryItemBase } from "@/types/library";

async function loadLibrary(sector: string): Promise<LibraryItemBase[]> {
  const res = await fetch(`/api/libraries/${sector}`);
  if (!res.ok) throw new Error(`Failed ${res.status}`);
  return res.json();
}

/** Simple client hook for the Libraries REST API */
export function useLibrary(sector: string) {
  const [items, setItems] = useState<LibraryItemBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await loadLibrary(sector));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [sector]);

  /**
   * Create a new library item.
   * Returns the created item as returned by the API.
   */
  const createItem = useCallback(
    async (item: Omit<LibraryItemBase, "id">) => {
      const res = await fetch(`/api/libraries/${sector}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Create failed ${res.status}`);
      }
      const created: LibraryItemBase = await res.json();
      setItems((prev) => [...prev, created]);
      return created;
    },
    [sector]
  );

  /**
   * Update an existing library item.
   * `item` must include a valid `id`.
   */
  const updateItem = useCallback(
    async (item: LibraryItemBase) => {
      const res = await fetch(`/api/libraries/${sector}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Update failed ${res.status}`);
      }
      const updated: LibraryItemBase = await res.json();
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      return updated;
    },
    [sector]
  );

  /**
   * Delete a library item by id.
   */
  const deleteItem = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/libraries/${sector}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Delete failed ${res.status}`);
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [sector]
  );

  // Initial load: state is only set after the request resolves, and a stale
  // response (sector changed or unmounted) is ignored.
  useEffect(() => {
    let cancelled = false;
    loadLibrary(sector)
      .then((data) => { if (!cancelled) { setItems(data); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sector]);

  return { items, loading, error, fetchItems, createItem, updateItem, deleteItem };
}
