"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Building2 } from "lucide-react";
import { SupplierPOView } from "./supplier-po-view";
import { SupplierRFQResponse } from "./supplier-rfq-response";
import { SupplierDeliveryForm } from "./supplier-delivery-form";

interface Supplier {
  id: string;
  supplier_name: string;
  supplier_code: string;
}

type Tab = "pos" | "rfqs" | "delivery";

const TAB_IDS: Tab[] = ["rfqs", "pos", "delivery"];

export function SupplierPortal() {
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as Tab | null;
  const tab: Tab = subParam && TAB_IDS.includes(subParam) ? subParam : "rfqs";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
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

      {tab === "pos" && <SupplierPOView supplierId={selectedSupplierId || activeSupplier.id} />}
      {tab === "rfqs" && <SupplierRFQResponse supplierId={selectedSupplierId || activeSupplier.id} />}
      {tab === "delivery" && <SupplierDeliveryForm supplierId={selectedSupplierId || activeSupplier.id} />}
    </div>
  );
}
