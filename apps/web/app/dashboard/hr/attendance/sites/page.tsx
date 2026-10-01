"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Plus, QrCode, RefreshCw, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LocationPicker } from "@/components/ui/location-picker";
import { deleteSiteLocationById, insertEmployeeAttendanceSiteAssignment, insertSiteLocation, listEmployeeAttendanceSiteAssignmentsByFilter, listProfilesWithStatusActiveOrderedByFullName, listSiteLocations, updateEmployeeAttendanceSiteAssignmentById } from "@/lib/hr/hr-queries";

interface SiteLocation {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_meters: number;
  qr_token: string | null;
  qr_expires_at: string | null;
  qr_rotation_min: number;
  is_active: boolean;
}

interface EmployeeOption {
  id: string;
  full_name: string;
  employee_id: string | null;
  department: string | null;
}

interface SiteAssignment {
  id: string;
  employee_id: string;
  site_id: string;
  effective_from: string;
  effective_to: string | null;
  is_required: boolean;
}

const DEFAULT_FORM = { name: "", address: "", lat: null as number | null, lng: null as number | null, radius_meters: "100", qr_rotation_min: "5" };

function getUniqueSiteAssignments(assignments: SiteAssignment[], siteId: string) {
  const seen = new Set<string>();
  return assignments.filter((assignment) => {
    if (assignment.site_id !== siteId) return false;
    if (seen.has(assignment.employee_id)) return false;
    seen.add(assignment.employee_id);
    return true;
  });
}

function QrDisplay({ token, siteId, onRotate }: {
  token: string | null;
  siteId: string;
  onRotate: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render QR using canvas (simple dot-matrix — uses qrcode library if available, otherwise shows token)
  useEffect(() => {
    if (!token || !canvasRef.current) return;
    const payload = JSON.stringify({
      type: "dcos.attendance",
      site_id: siteId,
      token,
    });
    // Dynamic import of qrcode library
    import("qrcode").then(QRCode => {
      QRCode.toCanvas(canvasRef.current!, payload, { width: 200, margin: 2 }, (err) => {
        if (err) console.error(err);
      });
    }).catch(() => {
      // Fallback: just show the token text
    });
  }, [siteId, token]);

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="h-48 w-48 flex items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground text-sm text-center p-4">
          No QR generated yet
        </div>
        <Button onClick={onRotate}><RefreshCw className="mr-2 h-4 w-4" />Generate QR</Button>
      </div>
    );
  }


  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} className="rounded-lg border" />
      <div className="text-sm text-center space-y-1">
        <p className="font-mono text-xs text-muted-foreground break-all px-4">{token}</p>
        <p className="text-xs text-muted-foreground">Fixed site QR. Regenerate it only when you want to replace the posted code.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRotate}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" />Regenerate QR
      </Button>
    </div>
  );
}

export default function SitesPage() {
  const [sites, setSites] = useState<SiteLocation[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [assignments, setAssignments] = useState<SiteAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [qrSite, setQrSite] = useState<SiteLocation | null>(null);
  const [assignmentSite, setAssignmentSite] = useState<SiteLocation | null>(null);
  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState("");
  const [assignmentFrom, setAssignmentFrom] = useState(new Date().toISOString().split("T")[0]);
  const [rotating, setRotating] = useState(false);
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

  useEffect(() => { loadSites(); }, []);

  async function loadSites() {
    setLoading(true);
    const supabase = createClient();
    const [{ data: siteRows, error: siteError }, { data: employeeRows, error: employeeError }, { data: assignmentRows, error: assignmentError }] = await Promise.all([
      listSiteLocations(),
      listProfilesWithStatusActiveOrderedByFullName("id, full_name, employee_id, department"),
      listEmployeeAttendanceSiteAssignmentsByFilter(`effective_to.is.null,effective_to.gte.${new Date().toISOString().split("T")[0]}`),
    ]);
    if (siteError) toast.error(siteError.message);
    if (employeeError) toast.error(employeeError.message);
    if (assignmentError) toast.error(assignmentError.message);
    setSites(siteRows ?? []);
    setEmployees((employeeRows ?? []) as EmployeeOption[]);
    setAssignments((assignmentRows ?? []) as SiteAssignment[]);
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.name.trim()) return toast.error("Site name is required");
    setSaving(true);
    const supabase = createClient();
    const { error } = await insertSiteLocation({
      name: form.name,
      address: form.address || null,
      lat: form.lat,
      lng: form.lng,
      radius_meters: Number(form.radius_meters) || 100,
      qr_rotation_min: Number(form.qr_rotation_min) || 5,
      is_active: true,
    });
    if (error) toast.error(error.message);
    else { toast.success("Site created"); setShowCreate(false); setForm(DEFAULT_FORM); loadSites(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await deleteSiteLocationById(id);
    if (error) toast.error(error.message);
    else { toast.success("Site deleted"); loadSites(); }
  }

  async function handleAssignStaff() {
    if (!assignmentSite) return;
    if (!assignmentEmployeeId) return toast.error("Select a staff member");
    setSaving(true);
    const supabase = createClient();
    const existingAssignment = assignments.find(
      (assignment) =>
        assignment.site_id === assignmentSite.id &&
        assignment.employee_id === assignmentEmployeeId &&
        assignment.effective_to == null
    );
    if (existingAssignment) {
      setSaving(false);
      return toast.error("This staff member is already assigned to the site");
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await insertEmployeeAttendanceSiteAssignment({
      employee_id: assignmentEmployeeId,
      site_id: assignmentSite.id,
      effective_from: assignmentFrom,
      is_required: true,
      assigned_by: user?.id ?? null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Staff assigned to attendance site");
      setAssignmentEmployeeId("");
      await loadSites();
    }
    setSaving(false);
  }

  async function endAssignment(id: string) {
    const supabase = createClient();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const { error } = await updateEmployeeAttendanceSiteAssignmentById({ effective_to: yesterday, updated_at: new Date().toISOString() }, id);
    if (error) toast.error(error.message);
    else {
      toast.success("Assignment ended");
      await loadSites();
    }
  }

  const rotateQR = useCallback(async (siteId: string) => {
    setRotating(true);
    const res = await fetch("/api/hr/attendance/qr/rotate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId }),
    });
    const data = await res.json();
    if (res.ok) {
      setSites(prev => prev.map(s => s.id === siteId ? { ...s, qr_token: data.qr_token, qr_expires_at: data.expires_at } : s));
      setQrSite(prev => prev?.id === siteId ? { ...prev!, qr_token: data.qr_token, qr_expires_at: data.expires_at } : prev);
    } else {
      toast.error(data.error ?? "Failed to generate QR");
    }
    setRotating(false);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h1 className="text-2xl font-semibold">Site Locations & QR</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage geofenced sites and fixed QR codes for attendance</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />Add Site
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className={cn(
          "grid gap-4",
          sites.length <= 1 ? "grid-cols-1" : sites.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
        )}>
          {sites.map(site => {
            const siteAssignments = getUniqueSiteAssignments(assignments, site.id);
            const assignedCount = siteAssignments.length;
            return (
              <Card key={site.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{site.name}</CardTitle>
                    <Badge variant={site.is_active ? "default" : "secondary"}>
                      {site.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {site.address && <CardDescription>{site.address}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    {site.lat && site.lng && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />{Number(site.lat).toFixed(4)}, {Number(site.lng).toFixed(4)}
                      </span>
                    )}
                    <span>±{site.radius_meters}m</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <QrCode className="h-3.5 w-3.5" />
                    {site.qr_token ? (
                      <span className="text-green-600">QR ready</span>
                    ) : (
                      <span className="text-orange-500">QR not generated</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>{assignedCount} staff assigned for required QR attendance</span>
                  </div>
                  {siteAssignments.length > 0 ? (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      {siteAssignments.slice(0, 3).map((assignment) => {
                        const profile = employeeMap.get(assignment.employee_id);
                        return (
                          <div key={assignment.employee_id} className="truncate">
                            {profile?.full_name ?? "Unknown staff"}
                          </div>
                        );
                      })}
                      {siteAssignments.length > 3 ? (
                        <div className="mt-1 text-[11px]">+{siteAssignments.length - 3} more</div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1"
                      onClick={() => { setQrSite(site); if (!site.qr_token) rotateQR(site.id); }}>
                      <QrCode className="mr-1.5 h-3.5 w-3.5" />Show QR
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1"
                      onClick={() => { setAssignmentSite(site); setAssignmentEmployeeId(""); }}>
                      <Users className="mr-1.5 h-3.5 w-3.5" />Staff
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(site.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {sites.length === 0 && (
            <div className="col-span-2 py-12 text-center text-sm text-muted-foreground">
              No sites yet. Add a site to enable GPS and QR check-in.
            </div>
          )}
        </div>
      )}

      {/* Create site dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setForm(DEFAULT_FORM); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Add Site Location</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Site Name</Label>
              <Input placeholder="e.g. HQ Office" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Location</Label>
              <LocationPicker
                lat={form.lat}
                lng={form.lng}
                address={form.address}
                radius={Number(form.radius_meters) || 100}
                onChange={(lat, lng, address) => setForm(f => ({ ...f, lat, lng, address }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Geofence Radius (m)</Label>
              <Input type="number" min={10} value={form.radius_meters} onChange={e => setForm(f => ({ ...f, radius_meters: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR modal */}
      <Dialog open={!!qrSite} onOpenChange={() => setQrSite(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{qrSite?.name} — QR Code</DialogTitle></DialogHeader>
          {rotating ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : qrSite && (
            <QrDisplay
              token={qrSite.qr_token}
              siteId={qrSite.id}
              onRotate={() => rotateQR(qrSite.id)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Staff assignment modal */}
      <Dialog open={!!assignmentSite} onOpenChange={(open) => { if (!open) setAssignmentSite(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{assignmentSite?.name} - Staff QR Requirement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-1.5">
                <Label>Staff Member</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={assignmentEmployeeId}
                  onChange={(e) => setAssignmentEmployeeId(e.target.value)}
                >
                  <option value="">Select staff</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name}{emp.employee_id ? ` (${emp.employee_id})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input type="date" value={assignmentFrom} onChange={e => setAssignmentFrom(e.target.value)} />
              </div>
            </div>

            <Button className="w-full" onClick={handleAssignStaff} disabled={saving || !assignmentEmployeeId}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              Require QR Attendance
            </Button>

            <div className="divide-y rounded-md border">
              {getUniqueSiteAssignments(assignments, assignmentSite?.id ?? "").length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No active staff assignments</p>
              ) : (
                getUniqueSiteAssignments(assignments, assignmentSite?.id ?? "").map(a => {
                  const profile = employeeMap.get(a.employee_id);
                  return (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{profile?.full_name ?? "Unknown staff"}</p>
                      <p className="text-xs text-muted-foreground">
                        From {a.effective_from}{profile?.department ? ` - ${profile.department}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => endAssignment(a.id)}>
                      End
                    </Button>
                  </div>
                );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
