"use client";

import { useEffect, useState } from "react";
import { listAssetAssignmentsWithStatusActive, listEmployeeAssets, listEmployeeAssetsOrderedByPurchaseDate } from "@/lib/hr/hr-queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package } from "lucide-react";
import { format } from "date-fns";

interface AssetAssignment {
  id: string;
  assignment_date: string;
  return_date: string;
  status: string;
  condition_on_assignment: string;
  profiles: {
    full_name: string;
    employee_id: string;
  };
  employee_assets: {
    asset_code: string;
    asset_name: string;
    asset_type: string;
    brand: string;
    model: string;
  };
}

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: number;
  status: string;
  warranty_expiry: string;
  brand?: string;
  model?: string;
}

export default function AssetsPage() {
  const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState({
    total_assets: 0,
    assigned: 0,
    in_stock: 0,
    in_maintenance: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    // Fetch asset inventory statistics
    listEmployeeAssets()
      .then(({ data }) => {
        if (data) {
          const assigned = data.filter((a) => a.status === "assigned").length;
          const inStock = data.filter((a) => a.status === "in_stock").length;
          const maintenance = data.filter((a) => a.status === "maintenance").length;

          setStats({
            total_assets: data.length,
            assigned,
            in_stock: inStock,
            in_maintenance: maintenance,
          });
        }
      });

    // Fetch all assets
    listEmployeeAssetsOrderedByPurchaseDate()
      .then(({ data }) => {
        if (data) setAssets(data);
      });

    // Fetch active asset assignments
    listAssetAssignmentsWithStatusActive()
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) setAssignments(data as any);
        setLoading(false);
      });
  }, []);

  const getAssetStatusColor = (status: string) => {
    switch (status) {
      case "assigned":
        return "bg-green-50 text-green-700";
      case "in_stock":
        return "bg-blue-50 text-blue-700";
      case "maintenance":
        return "bg-amber-50 text-amber-700";
      case "retired":
        return "bg-gray-50 text-gray-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  const getAssetTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      laptop: "bg-purple-50 text-purple-700",
      phone: "bg-blue-50 text-blue-700",
      tablet: "bg-cyan-50 text-cyan-700",
      access_card: "bg-red-50 text-red-700",
      vehicle: "bg-orange-50 text-orange-700",
      ppe: "bg-yellow-50 text-yellow-700",
      equipment: "bg-green-50 text-green-700",
      other: "bg-gray-50 text-gray-700",
    };
    return colors[type] || "bg-gray-50 text-gray-700";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Asset Management</h2>
          <p className="text-muted-foreground">Track equipment and asset assignments</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Register Asset
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_assets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.assigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.in_stock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.in_maintenance}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Asset Inventory</CardTitle>
            <CardDescription>All registered equipment and assets</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading assets...</p>
              </div>
            ) : assets.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No assets registered</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {assets.slice(0, 15).map((asset) => (
                  <div key={asset.id} className="flex items-start justify-between border border-border rounded-lg p-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{asset.asset_name}</p>
                        <Badge className={`text-xs ${getAssetTypeColor(asset.asset_type)}`}>
                          {asset.asset_type.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {asset.brand && `${asset.brand} • `}SN: {asset.serial_number}
                      </p>
                      {asset.warranty_expiry && (
                        <p className="text-xs text-muted-foreground">
                          Warranty: {format(new Date(asset.warranty_expiry), "dd MMM yyyy")}
                        </p>
                      )}
                    </div>
                    <Badge className={`text-xs ${getAssetStatusColor(asset.status)}`}>
                      {asset.status.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Assignments</CardTitle>
            <CardDescription>Active asset assignments to employees</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading assignments...</p>
              </div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No active assignments</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {assignments.slice(0, 10).map((assignment) => (
                  <div key={assignment.id} className="flex items-start justify-between border border-border rounded-lg p-3 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{assignment.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{assignment.employee_assets.asset_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.employee_assets.brand && `${assignment.employee_assets.brand} • `}
                        {assignment.employee_assets.model}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Assigned: {format(new Date(assignment.assignment_date), "dd MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className="text-xs capitalize"
                      >
                        {assignment.condition_on_assignment || "good"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asset Summary by Type</CardTitle>
          <CardDescription>Distribution of assets across categories</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || assets.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">
                {loading ? "Loading..." : "No asset data available"}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              {Object.entries(
                assets.reduce(
                  (acc, asset) => {
                    acc[asset.asset_type] = (acc[asset.asset_type] || 0) + 1;
                    return acc;
                  },
                  {} as Record<string, number>
                )
              )
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="p-4 border border-border rounded-lg">
                    <p className="text-sm text-muted-foreground capitalize">{type.replace(/_/g, " ")}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
