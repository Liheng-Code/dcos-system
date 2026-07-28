"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, RefreshCw, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// FR-017 reorder-alert bridge: Inventory (inv_items / inv_stock) -> Procurement (draft PR).
// This used to read the legacy procurement_inventory stub table directly; that table is
// no longer the warehouse system of record — inv_items/inv_stock (the Inventory module,
// Module 26) is. Stock is summed across every store/project the caller's RLS-scoped
// session can see, since an item can carry balances in more than one store.

interface InvStockRow {
  quantity_available: number | null;
  unit_cost_fifo: number | null;
  store_id: string;
}

interface InvItemRow {
  id: string;
  item_code: string;
  name: string;
  unit_of_measure: string;
  min_stock_level: number | null;
  reorder_quantity: number | null;
  inv_stock: InvStockRow[] | null;
}

interface LowStockItem {
  id: string;
  item_code: string;
  item_description: string;
  unit: string;
  quantity_on_hand: number;
  minimum_stock: number;
  reorder_quantity: number | null;
  unit_cost: number | null;
}

export function AutoReorder() {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  function fetchLowStock() {
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("inv_items")
      .select("id, item_code, name, unit_of_measure, min_stock_level, reorder_quantity, inv_stock(quantity_available, unit_cost_fifo, store_id)")
      .eq("is_active", true)
      .not("min_stock_level", "is", null)
      .order("item_code")
      .then(({ data }) => {
        if (data) {
          const rows = data as unknown as InvItemRow[];
          const low: LowStockItem[] = [];

          for (const row of rows) {
            const minStock = row.min_stock_level ?? 0;
            const stockRows = row.inv_stock ?? [];
            const quantityOnHand = stockRows.reduce((sum, s) => sum + (s.quantity_available ?? 0), 0);

            if (quantityOnHand > minStock) continue;

            // Weighted-average unit cost across stores; falls back to a plain average
            // of any known costs if every store balance happens to be zero.
            const costed = stockRows.filter(s => s.unit_cost_fifo != null);
            let unitCost: number | null = null;
            if (quantityOnHand > 0) {
              const costWeightedSum = stockRows.reduce((sum, s) => sum + (s.quantity_available ?? 0) * (s.unit_cost_fifo ?? 0), 0);
              unitCost = costWeightedSum / quantityOnHand;
            } else if (costed.length > 0) {
              unitCost = costed.reduce((sum, s) => sum + (s.unit_cost_fifo ?? 0), 0) / costed.length;
            }

            low.push({
              id: row.id,
              item_code: row.item_code,
              item_description: row.name,
              unit: row.unit_of_measure,
              quantity_on_hand: quantityOnHand,
              minimum_stock: minStock,
              reorder_quantity: row.reorder_quantity,
              unit_cost: unitCost,
            });
          }

          setItems(low);
        }
        setLoading(false);
      });
  }

  useEffect(() => { fetchLowStock(); }, []);

  function suggestedQtyFor(item: LowStockItem): number {
    if (item.reorder_quantity && item.reorder_quantity > 0) return item.reorder_quantity;
    return Math.max(item.minimum_stock * 2 - item.quantity_on_hand, 1);
  }

  async function handleCreatePR(item: LowStockItem) {
    const reorderQty = suggestedQtyFor(item);
    setCreating(true);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not authenticated"); setCreating(false); return; }

    const { data: prData, error: prError } = await supabase
      .from("procurement_prs")
      .insert([{
        priority: "medium",
        approval_status: "draft",
        notes: `Auto-reorder: ${item.item_description} (stock: ${item.quantity_on_hand}, min: ${item.minimum_stock})`,
        total_estimated_cost: reorderQty * (item.unit_cost || 0),
      }])
      .select("id")
      .single();

    if (prError) { toast.error(prError.message); setCreating(false); return; }

    const prId = (prData as { id: string }).id;

    const { error: itemError } = await supabase
      .from("procurement_pr_items")
      .insert([{
        pr_id: prId,
        line_no: 1,
        item_code: item.item_code,
        item_description: item.item_description,
        unit: item.unit,
        quantity: reorderQty,
        estimated_unit_price: item.unit_cost,
        estimated_total: reorderQty * (item.unit_cost || 0),
        notes: `Auto-reorder triggered (on hand: ${item.quantity_on_hand}, min: ${item.minimum_stock})`,
      }]);

    if (itemError) { toast.error(itemError.message); } else {
      toast.success(`Draft PR created for ${item.item_code}`);
    }
    setCreating(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "All inventory items are above their minimum stock levels."
              : `${items.length} item(s) at or below minimum stock.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLowStock} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map(item => {
            const deficit = item.minimum_stock - item.quantity_on_hand;
            const suggestedQty = suggestedQtyFor(item);
            return (
              <Card key={item.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{item.item_code}</span>
                        <Badge className="bg-red-500/10 text-red-600 border-red-200" variant="outline">Low Stock</Badge>
                      </div>
                      <p className="text-sm">{item.item_description}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>On hand: <strong className="text-foreground">{item.quantity_on_hand}</strong> {item.unit}</span>
                        <span>Min: <strong>{item.minimum_stock}</strong> {item.unit}</span>
                        <span>Deficit: <strong className="text-red-600">{deficit}</strong> {item.unit}</span>
                        {item.unit_cost != null && <span>Unit cost: <strong>${item.unit_cost.toFixed(2)}</strong></span>}
                      </div>
                      <p className="text-xs text-muted-foreground">Suggested reorder: {suggestedQty} {item.unit} (est. ${(suggestedQty * (item.unit_cost || 0)).toFixed(2)})</p>
                    </div>
                    <Button size="sm" onClick={() => handleCreatePR(item)} disabled={creating} className="gap-2">
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                      Create PR
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
