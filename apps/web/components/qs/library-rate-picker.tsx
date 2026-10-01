"use client";

// Shared Direct Works Cost Library picker — QS-SOP-003 (docs/03-Business-Modules/
// 12-Quantity-Surveying/08-SOP_Direct_Works_Library_Tender_BOQ_Integration.md), §9
// Phased Build Order, step 1.
//
// Read-only search/browse over dwl_v_work_item_rates + dwl_v_assembly_rates.
// Returns the picked row via onSelect; building a rate_build_up snapshot from
// that row (§5 of the SOP) is the caller's job, not this component's — this
// component does not know about tender_boq_items, boq-tab.tsx, boq-builder.tsx,
// or any tender/qs-specific permission hook. Gate "who is allowed to open this"
// at the call site (e.g. `can("tender_boq", "can_create")`), not in here, so
// the same component can be reused from both the tender module and the
// project QS module (SOP §9 step 1 / §2 scope note).

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { listDwlVAssemblyRatesOrderedByCode, listDwlVWorkItemRatesOrderedByCode } from "@/lib/qs/qs-queries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DwlAssemblyRate, DwlWorkItemRate } from "@/components/qs/dwl-types";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

// Discriminated union the caller switches on to know which library table the
// pick came from and to build a rate snapshot (SOP §5) accordingly. The full
// view row is passed through unstripped, per the task brief.
export type LibraryRatePickerSelection =
  | { kind: "work_item"; data: DwlWorkItemRate }
  | { kind: "assembly"; data: DwlAssemblyRate };

export interface LibraryRatePickerProps {
  /** Controlled open state — standard shadcn Dialog pattern. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the picked row; the dialog closes itself right after. */
  onSelect: (selection: LibraryRatePickerSelection) => void;
}

export function LibraryRatePicker({ open, onOpenChange, onSelect }: LibraryRatePickerProps) {

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [workItems, setWorkItems] = useState<DwlWorkItemRate[]>([]);
  const [assemblies, setAssemblies] = useState<DwlAssemblyRate[]>([]);

  const [workItemSearch, setWorkItemSearch] = useState("");
  const [assemblySearch, setAssemblySearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const [wiResult, asmResult] = await Promise.all([
      listDwlVWorkItemRatesOrderedByCode(),
      listDwlVAssemblyRatesOrderedByCode(),
    ]);

    if (wiResult.error) {
      setErrorMsg(wiResult.error.message);
      setLoading(false);
      return;
    }
    if (asmResult.error) {
      setErrorMsg(asmResult.error.message);
      setLoading(false);
      return;
    }

    setWorkItems((wiResult.data ?? []) as DwlWorkItemRate[]);
    setAssemblies((asmResult.data ?? []) as DwlAssemblyRate[]);
    setLoading(false);
  }, []);

  // Load a fresh copy every time the dialog is opened — this is a read-only
  // picker over a small, frequently-changing (append-only pricing) library,
  // so there is no reason to serve stale data from a prior open.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset transient search state when the dialog closes, so re-opening it
  // later doesn't show a leftover filter from the previous use.
  useEffect(() => {
    if (open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkItemSearch("");
    setAssemblySearch("");
  }, [open]);

  const filteredWorkItems = useMemo(() => {
    const q = workItemSearch.trim().toLowerCase();
    if (!q) return workItems;
    return workItems.filter(
      (wi) => wi.code.toLowerCase().includes(q) || wi.description.toLowerCase().includes(q)
    );
  }, [workItems, workItemSearch]);

  const filteredAssemblies = useMemo(() => {
    const q = assemblySearch.trim().toLowerCase();
    if (!q) return assemblies;
    return assemblies.filter(
      (a) => a.code.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    );
  }, [assemblies, assemblySearch]);

  function pickWorkItem(row: DwlWorkItemRate) {
    onSelect({ kind: "work_item", data: row });
    onOpenChange(false);
  }

  function pickAssembly(row: DwlAssemblyRate) {
    onSelect({ kind: "assembly", data: row });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add from Cost Library</DialogTitle>
          <DialogDescription>
            Search the Direct Works Cost Library and pick a Work Item or Assembly to price this line from.
          </DialogDescription>
        </DialogHeader>

        {errorMsg ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive/60" />
            <p className="text-sm text-muted-foreground">Failed to load the cost library: {errorMsg}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <Tabs defaultValue="work_items">
            <TabsList>
              <TabsTrigger value="work_items">Work Items</TabsTrigger>
              <TabsTrigger value="assemblies">Assemblies</TabsTrigger>
            </TabsList>

            <TabsContent value="work_items" className="flex flex-col gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={workItemSearch}
                  onChange={(e) => setWorkItemSearch(e.target.value)}
                  placeholder="Search code or description…"
                  className="pl-8"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredWorkItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <p className="text-sm text-muted-foreground">
                    {workItems.length === 0
                      ? "No work items in the cost library yet."
                      : "No work items match your search."}
                  </p>
                </div>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="w-28">Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-16">Unit</TableHead>
                        <TableHead className="w-24 text-right">Rate</TableHead>
                        <TableHead className="w-40" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWorkItems.map((row) => (
                        <TableRow
                          key={row.work_item_id}
                          onClick={() => pickWorkItem(row)}
                          className="cursor-pointer"
                        >
                          <TableCell className="font-mono text-xs font-medium">{row.code}</TableCell>
                          <TableCell className="text-xs">
                            <div className="line-clamp-2">{row.description}</div>
                            <span className="text-[10px] text-muted-foreground">
                              {row.boq_section} · {row.recipe_lines} component{row.recipe_lines === 1 ? "" : "s"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.unit}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">
                            {formatMoney(row.net_direct_rate)}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.has_expired_price && (
                              <Badge variant="outline" className="text-muted-foreground">
                                Library price expired
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="assemblies" className="flex flex-col gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={assemblySearch}
                  onChange={(e) => setAssemblySearch(e.target.value)}
                  placeholder="Search code or description…"
                  className="pl-8"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAssemblies.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <p className="text-sm text-muted-foreground">
                    {assemblies.length === 0
                      ? "No assemblies in the cost library yet."
                      : "No assemblies match your search."}
                  </p>
                </div>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="w-28">Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-16">Unit</TableHead>
                        <TableHead className="w-24 text-right">Rate</TableHead>
                        <TableHead className="w-40" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssemblies.map((row) => (
                        <TableRow
                          key={row.assembly_id}
                          onClick={() => pickAssembly(row)}
                          className="cursor-pointer"
                        >
                          <TableCell className="font-mono text-xs font-medium">{row.code}</TableCell>
                          <TableCell className="text-xs">
                            <div className="line-clamp-2">{row.description}</div>
                            <span className="text-[10px] text-muted-foreground">{row.element_group}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.unit}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">
                            {formatMoney(row.net_direct_rate)}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.has_expired_price && (
                              <Badge variant="outline" className="text-muted-foreground">
                                Library price expired
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
