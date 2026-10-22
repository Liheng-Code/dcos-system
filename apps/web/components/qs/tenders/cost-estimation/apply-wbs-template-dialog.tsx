"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, Layers, CheckCircle2, Building, Calendar, ShoppingCart, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getQsWbsTemplates,
  getQsWbsTemplateDetails,
  getTenderProjectKind,
  instantiateBoqFromTemplate,
  type QsWbsTemplate,
  type QsWbsTemplateItem,
  type QsWbsTemplateLocation,
} from "@/lib/qs/tender-cost-service";
import { groupTemplates, type ProjectKind } from "@/lib/template-fit";
import { getQsWbsCategoryProfile } from "@/lib/qs/qs-wbs-template-profiles";
import { qsWbsLocationLabel, resolveQsWbsLocationKind } from "@/lib/qs/qs-wbs-location-kinds";

interface Props {
  tenderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function templateAppliesToProject(template: QsWbsTemplate, kind: ProjectKind) {
  const sectorMatches = !template.template_category || !kind.sector || template.template_category === kind.sector;
  const typeMatches = template.building_types.length === 0 || !kind.buildingType || template.building_types.includes(kind.buildingType);
  return sectorMatches && typeMatches;
}

export function ApplyWbsTemplateDialog({ tenderId, open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const [templates, setTemplates] = useState<QsWbsTemplate[]>([]);
  const [projectKind, setProjectKind] = useState<ProjectKind>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [buildingCode, setBuildingCode] = useState<string>("BA");
  const [buildingName, setBuildingName] = useState<string>("Tower A");

  const [templateItems, setTemplateItems] = useState<QsWbsTemplateItem[]>([]);
  const [templateLocations, setTemplateLocations] = useState<QsWbsTemplateLocation[]>([]);
  const [selectedLevelCodes, setSelectedLevelCodes] = useState<Set<string>>(new Set());
  const categoryProfile = getQsWbsCategoryProfile(projectKind.sector, projectKind.buildingType);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const locationEntityLabel = selectedTemplate?.location_model === "linear"
    ? "Route"
    : selectedTemplate?.location_model === "facility"
      ? "Facility"
      : selectedTemplate?.location_model === "campus"
        ? "Campus / Area"
        : "Building";

  // Load templates on open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setLoading(true);
    Promise.all([getQsWbsTemplates(), getTenderProjectKind(tenderId)])
      .then(([data, kind]) => {
        const profile = getQsWbsCategoryProfile(kind.sector, kind.buildingType);
        const groups = groupTemplates(data, kind);
        const ordered = groups.flatMap((group) => group.items);
        if (profile) {
          const rank = (template: QsWbsTemplate) => {
            if (!templateAppliesToProject(template, kind)) return 3;
            if (template.template_family === profile.primaryFamily) return 0;
            if (profile.alternativeFamilies.includes(template.template_family as typeof profile.primaryFamily)) return 1;
            return 2;
          };
          ordered.sort((a, b) => rank(a) - rank(b));
        }
        setProjectKind(kind);
        setTemplates(ordered);
        const recommended = (profile && ordered.find((template) => templateAppliesToProject(template, kind) && template.template_family === profile.primaryFamily))
          ?? groups.find((group) => group.recommended)?.items[0];
        if (recommended) setSelectedTemplateId(recommended.id);
        else if (ordered.length > 0 && !selectedTemplateId) setSelectedTemplateId(ordered[0].id);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [open, tenderId]);

  // Load details when selectedTemplateId changes
  useEffect(() => {
    if (!selectedTemplateId) return;
    setLoading(true);
    getQsWbsTemplateDetails(selectedTemplateId)
      .then(({ items, locations }) => {
        setTemplateItems(items);
        setTemplateLocations(locations);
        setSelectedLevelCodes(new Set(locations.map((l) => l.level_code)));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [selectedTemplateId]);

  const selectedLocationsList = useMemo(() => {
    return templateLocations.filter((l) => selectedLevelCodes.has(l.level_code));
  }, [templateLocations, selectedLevelCodes]);

  const totalLinesToGenerate = useMemo(() => {
    return templateItems.length * selectedLocationsList.length;
  }, [templateItems, selectedLocationsList]);

  // Unique procurement packages
  const uniquePackages = useMemo(() => {
    const pkgs = new Set<string>();
    templateItems.forEach((i) => {
      if (i.procurement_package_name) pkgs.add(i.procurement_package_name);
      else if (i.default_procurement_package_code) pkgs.add(i.default_procurement_package_code);
    });
    return Array.from(pkgs);
  }, [templateItems]);

  function toggleLevel(code: string) {
    setSelectedLevelCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleApply() {
    if (totalLinesToGenerate === 0) {
      toast.error("Please select at least one location pattern.");
      return;
    }
    setSubmitting(true);
    try {
      const count = await instantiateBoqFromTemplate(
        tenderId,
        selectedTemplateId,
        buildingCode.trim() || "BA",
        buildingName.trim() || buildingCode.trim() || "Building",
        templateItems,
        selectedLocationsList.map((l) => ({
          code: l.level_code,
          name: l.level_name,
          kind: resolveQsWbsLocationKind({
            locationModel: selectedTemplate?.location_model,
            locationType: l.location_type,
            locationCode: l.level_code,
            locationKind: l.location_kind,
          }),
          patternType: l.location_type,
          config: l.location_config ?? {},
        }))
      );
      toast.success(`Successfully generated ${count} Tender BOQ lines from template!`);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Layers className="h-5 w-5 text-blue-600" />
            Apply Standard WBS Template
          </DialogTitle>
          <DialogDescription>
            Scaffold a standardized Tender BOQ structure pre-configured with international CBS, Planning, and Procurement frameworks.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm text-muted-foreground">Loading template specifications...</p>
          </div>
        ) : step === 1 ? (
          <div className="space-y-6 py-2">
            {/* Step 1: Template Selection */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">1. Select Standard Template</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map((tpl, index) => {
                  const isSelected = tpl.id === selectedTemplateId;
                  const isRecommended = templateAppliesToProject(tpl, projectKind) && (
                    (!!categoryProfile && tpl.template_family === categoryProfile.primaryFamily)
                    || index === 0 && !!projectKind.buildingType && tpl.building_types.includes(projectKind.buildingType)
                    || index === 0 && !!projectKind.sector && tpl.template_category === projectKind.sector && tpl.building_types.length === 0
                  );
                  return (
                    <Card
                      key={tpl.id}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`cursor-pointer transition-all border ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm"
                          : "hover:border-slate-300"
                      }`}
                    >
                      <CardContent className="p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-foreground">{tpl.title}</span>
                          <Badge variant={isSelected ? "default" : "outline"} className="text-xs">
                            {tpl.template_code}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                        <div className="flex gap-2 pt-1 text-[11px] text-muted-foreground">
                          {isRecommended && <Badge variant="secondary" className="text-[10px]">Recommended</Badge>}
                          <span className="capitalize">{tpl.template_family?.replace(/_/g, " ") ?? tpl.building_type}</span>
                          <span>•</span>
                          <span className="capitalize">{tpl.location_model}</span>
                          <span>•</span>
                          <span>{tpl.standard_framework.replace(/_/g, " ")}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {categoryProfile && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Category profile: <span className="font-medium text-foreground">{categoryProfile.primaryFamily.replace(/_/g, " ")}</span>
                  {categoryProfile.requiresScopeReview ? " · Confirm scale, phases, and package scope before applying." : " · Confirm this template matches the estimate scope."}
                </p>
              )}
            </div>

            {/* Project location scope */}
            <div className="grid grid-cols-2 gap-4 p-3.5 rounded-lg border bg-muted/30">
              <div className="space-y-1.5">
                <Label htmlFor="bldg-code" className="text-xs font-medium">{locationEntityLabel} Code</Label>
                <Input
                  id="bldg-code"
                  value={buildingCode}
                  onChange={(e) => setBuildingCode(e.target.value.toUpperCase())}
                  placeholder="BA"
                  className="h-8 text-sm uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bldg-name" className="text-xs font-medium">{locationEntityLabel} Name</Label>
                <Input
                  id="bldg-name"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  placeholder="Tower A"
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Location Checkboxes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">2. Select Target Locations</Label>
                <span className="text-xs text-muted-foreground">
                  {selectedLocationsList.length} of {templateLocations.length} patterns selected
                </span>
              </div>
              <div className="space-y-2 border rounded-md p-3 bg-background max-h-48 overflow-y-auto">
                {templateLocations.map((loc) => {
                  const checked = selectedLevelCodes.has(loc.level_code);
                  return (
                    <label
                      key={loc.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleLevel(loc.level_code)}
                        />
                        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 bg-muted rounded">
                          {loc.level_code}
                        </span>
                        <span>{loc.level_name}</span>
                      </div>
                      <Badge variant="secondary" className="text-[11px]">
                        {qsWbsLocationLabel(resolveQsWbsLocationKind({
                          locationModel: selectedTemplate?.location_model,
                          locationType: loc.location_type,
                          locationCode: loc.level_code,
                          locationKind: loc.location_kind,
                        }))}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Step 2: Crosswalk & Matrix Preview */
          <div className="space-y-5 py-2">
            {/* Top Stat Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 text-center">
                <div className="text-2xl font-bold text-blue-600">{totalLinesToGenerate}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total BOQ Lines</div>
              </div>
              <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 text-center">
                <div className="text-2xl font-bold text-emerald-600">{templateItems.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Elemental Types (CBS)</div>
              </div>
              <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 text-center">
                <div className="text-2xl font-bold text-amber-600">{uniquePackages.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Procurement Packages</div>
              </div>
            </div>

            {/* Integration Highlights */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Automated Downstream Connections
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-md border bg-muted/40 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    Planning / Scheduling Connection
                  </div>
                  <p className="text-muted-foreground">
                    All lines match <span className="font-mono text-foreground">plan_act_qs_bridge</span> rules. Durations will calculate automatically using standard productivity norms.
                  </p>
                </div>

                <div className="p-3 rounded-md border bg-muted/40 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <ShoppingCart className="h-4 w-4 text-amber-600" />
                    Procurement Connection
                  </div>
                  <p className="text-muted-foreground">
                    Items are pre-tagged with MasterFormat packages (e.g. Ready-Mix, Rebar) for instant consolidated PR/RFQ drafting.
                  </p>
                </div>
              </div>
            </div>

            {/* Scaffold Preview List */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Sample Scaffolded Items Preview
              </div>
              <div className="border rounded-md divide-y max-h-56 overflow-y-auto text-xs">
                {templateItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="p-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{item.section} › {item.sub_section}</div>
                      <div className="text-muted-foreground">{item.sub_element} ({item.typical_unit})</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {item.masterformat_code ?? "03 00 00"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {item.procurement_package_name ?? item.default_procurement_package_code}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 italic">
                Showing sample element templates across {selectedLocationsList.length} selected locations.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2 border-t">
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={loading || selectedLocationsList.length === 0}
                className="gap-1.5"
              >
                Review & Preview Matrix
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Back to Config
              </Button>
              <Button onClick={handleApply} disabled={submitting} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scaffolding {totalLinesToGenerate} Lines...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Scaffold BOQ Structure ({totalLinesToGenerate} lines)
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

