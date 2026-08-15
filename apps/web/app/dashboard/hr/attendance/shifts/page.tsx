"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Settings2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

interface WorkShift {
  id: string;
  name: string;
  shift_type: "fixed" | "flexible" | "rotating";
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  grace_minutes: number;
  work_days: string[];
}

interface Employee {
  id: string;
  full_name: string;
  department: string | null;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DEFAULT_SHIFT: Omit<WorkShift, "id"> = {
  name: "",
  shift_type: "fixed",
  start_time: "08:00",
  end_time: "17:00",
  break_minutes: 60,
  grace_minutes: 15,
  work_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Omit<WorkShift, "id">>(DEFAULT_SHIFT);
  const [saving, setSaving] = useState(false);

  // Assign dialog
  const [assignShift, setAssignShift] = useState<WorkShift | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => { loadShifts(); }, []);

  async function loadShifts() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from("work_shifts").select("*").order("name");
    setShifts(data ?? []);
    setLoading(false);
  }

  async function loadEmployees() {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, department")
      .eq("status", "active")
      .order("full_name");
    setEmployees(data ?? []);
  }

  function toggleDay(day: string) {
    setForm(f => ({
      ...f,
      work_days: f.work_days.includes(day)
        ? f.work_days.filter(d => d !== day)
        : [...f.work_days, day],
    }));
  }

  async function handleCreate() {
    if (!form.name.trim()) return toast.error("Shift name is required");
    setSaving(true);
    const supabase = createClient();
    const payload = {
      ...form,
      start_time: form.shift_type === "flexible" ? null : form.start_time,
      end_time: form.shift_type === "flexible" ? null : form.end_time,
    };
    const { error } = await supabase.from("work_shifts").insert(payload);
    if (error) { toast.error(error.message); }
    else { toast.success("Shift created"); setShowCreate(false); setForm(DEFAULT_SHIFT); loadShifts(); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("work_shifts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Shift deleted"); loadShifts(); }
  }

  async function handleAssign() {
    if (!assignShift || selectedEmployees.length === 0) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const rows = selectedEmployees.map(eid => ({
      employee_id: eid,
      shift_id: assignShift.id,
      effective_from: effectiveFrom,
      assigned_by: user?.id ?? null,
    }));

    const { error } = await supabase.from("employee_shift_assignments").insert(rows);
    if (error) toast.error(error.message);
    else { toast.success(`Assigned ${selectedEmployees.length} employee(s)`); setAssignShift(null); setSelectedEmployees([]); }
    setSaving(false);
  }

  function openAssign(shift: WorkShift) {
    setAssignShift(shift);
    setSelectedEmployees([]);
    loadEmployees();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h1 className="text-2xl font-semibold">Shift Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Define work schedules and assign them to employees</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />New Shift
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shifts.map(shift => (
            <Card key={shift.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{shift.name}</CardTitle>
                  <Badge variant="outline" className="text-xs capitalize">{shift.shift_type}</Badge>
                </div>
                <CardDescription>
                  {shift.shift_type === "fixed" && shift.start_time
                    ? `${shift.start_time.slice(0, 5)} – ${shift.end_time?.slice(0, 5) ?? "?"}`
                    : "Flexible hours"}
                  {" · "}
                  Grace: {shift.grace_minutes} min
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {DAYS.map(d => (
                    <span key={d}
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        shift.work_days?.includes(d)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >{d}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openAssign(shift)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />Assign
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(shift.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {shifts.length === 0 && (
            <div className="col-span-3 py-12 text-center text-sm text-muted-foreground">
              No shifts defined yet. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Create shift dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />Create Work Shift
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Shift Name</Label>
              <Input placeholder="e.g. Night Shift" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.shift_type} onValueChange={(v: WorkShift["shift_type"] | null) => v && setForm(f => ({ ...f, shift_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                  <SelectItem value="rotating">Rotating</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.shift_type !== "flexible" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Time</Label>
                  <Input type="time" value={form.start_time ?? ""} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Time</Label>
                  <Input type="time" value={form.end_time ?? ""} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Break (min)</Label>
                <Input type="number" min={0} value={form.break_minutes} onChange={e => setForm(f => ({ ...f, break_minutes: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Grace (min)</Label>
                <Input type="number" min={0} value={form.grace_minutes} onChange={e => setForm(f => ({ ...f, grace_minutes: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Work Days</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(d => (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                      form.work_days.includes(d) ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground"
                    }`}
                  >{d}</button>
                ))}
              </div>
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

      {/* Assign dialog */}
      <Dialog open={!!assignShift} onOpenChange={() => setAssignShift(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign "{assignShift?.name}" to Employees</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Effective From</Label>
              <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Employees ({selectedEmployees.length} selected)</Label>
              <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
                {employees.map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.includes(emp.id)}
                      onChange={e => setSelectedEmployees(prev =>
                        e.target.checked ? [...prev, emp.id] : prev.filter(id => id !== emp.id)
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium">{emp.full_name}</p>
                      {emp.department && <p className="text-xs text-muted-foreground">{emp.department}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignShift(null)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving || selectedEmployees.length === 0}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Assign {selectedEmployees.length > 0 ? `(${selectedEmployees.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
