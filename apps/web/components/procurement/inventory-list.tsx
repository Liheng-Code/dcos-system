"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface InventoryItem {
  id: string;
  item_code: string;
  item_description: string;
  unit: string;
  quantity_on_hand: number;
  minimum_stock: number;
  unit_cost: number | null;
  location: string | null;
  category: string | null;
  last_gr_id: string | null;
  updated_at: string;
}

export function InventoryList() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.from("procurement_inventory").select("*").order("item_code").then(({ data }) => {
      if (data) setItems(data as InventoryItem[]);
      setLoading(false);
    });
  }, []);

  const filtered = items.filter(i =>
    !search || i.item_code.toLowerCase().includes(search.toLowerCase()) ||
    i.item_description.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">On Hand</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Min Stock</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit Cost</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No inventory records found.</td></tr>
            ) : filtered.map(i => {
              const lowStock = i.minimum_stock > 0 && i.quantity_on_hand <= i.minimum_stock;
              return (
                <tr key={i.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono">{i.item_code}</td>
                  <td className="px-4 py-3 text-sm">{i.item_description}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{i.quantity_on_hand.toLocaleString()} {i.unit}</td>
                  <td className="px-4 py-3 text-sm text-right text-muted-foreground">{i.minimum_stock.toLocaleString()} {i.unit}</td>
                  <td className="px-4 py-3 text-sm text-right">{i.unit_cost ? `$${i.unit_cost.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{i.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    {lowStock ? (
                      <Badge className="bg-red-500/10 text-red-600 border-red-200" variant="outline">Low Stock</Badge>
                    ) : (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200" variant="outline">In Stock</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
