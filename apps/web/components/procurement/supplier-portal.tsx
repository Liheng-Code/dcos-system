"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Package, FileSearch, Truck, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupplierPOView } from "./supplier-po-view";
import { SupplierRFQResponse } from "./supplier-rfq-response";
import { SupplierDeliveryForm } from "./supplier-delivery-form";

interface Supplier {
  id: string;
  supplier_name: string;
  supplier_code: string;
}

type Tab = "pos" | "rfqs" | "delivery";

const TABS: { key: Tab; label: string; icon: typeof Package }[] = [
  { key: "pos", label: "Purchase Orders", icon: Package },
  { key: "rfqs", label: "RFQ Responses", icon: FileSearch },
  { key: "delivery", label: "Delivery Notice", icon: Truck },
];

export function SupplierPortal() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [tab, setTab] = useState<Tab>("pos");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("procurement_suppliers").select("id, supplier_name, supplier_code").eq("status", "active").order("supplier_name").then(({ data }) => {
      if (data) setSuppliers(data as Supplier[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (suppliers.length === 0) {
    return <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">No active suppliers found.</div>;
  }

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) ?? suppliers[0];
  if (!selectedSupplierId && suppliers.length > 0 && !selectedSupplierId) {
    setSelectedSupplierId(suppliers[0].id);
  }

  const activeSupplier = suppliers.find(s => s.id === selectedSupplierId) ?? suppliers[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <select
            className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-medium min-w-64"
            value={selectedSupplierId}
            onChange={e => setSelectedSupplierId(e.target.value)}
          >
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.supplier_code} — {s.supplier_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "ghost"}
            size="sm"
            className="rounded-b-none gap-2"
            onClick={() => setTab(t.key)}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "pos" && <SupplierPOView supplierId={selectedSupplierId || activeSupplier.id} />}
      {tab === "rfqs" && <SupplierRFQResponse supplierId={selectedSupplierId || activeSupplier.id} />}
      {tab === "delivery" && <SupplierDeliveryForm supplierId={selectedSupplierId || activeSupplier.id} />}
    </div>
  );
}
