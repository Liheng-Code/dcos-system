"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, X, AlertTriangle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PublicHoliday {
  id: string;
  holiday_date: string;
  holiday_name: string;
  year: number;
  is_active: boolean;
  note: string | null;
}

interface EditForm {
  holiday_date: string;
  holiday_name: string;
  year: number;
  is_active: boolean;
  note: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS      = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const YEAR_OPTS = [2026, 2027, 2028, 2029, 2030];

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const labelCls = "block text-sm font-medium text-foreground mb-1";

// ── Inline toggle ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PublicHolidaysPage() {
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // Add modal
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDates, setAddDates] = useState<string[]>([""]);
  const [addNote, setAddNote] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit modal
  const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ holiday_date: "", holiday_name: "", year: 2026, is_active: true, note: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [deletingHoliday, setDeletingHoliday] = useState<PublicHoliday | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Roll-forward modal
  const [showRollForward, setShowRollForward] = useState(false);
  const [rollLoading, setRollLoading] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

  // ── Fetch holidays + check role ────────────────────────────────────────────
  const fetchHolidays = async (year: number) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("leave_public_holidays")
      .select("id, holiday_date, holiday_name, year, is_active, note")
      .eq("year", year)
      .eq("is_active", true)
      .order("holiday_date");
    setHolidays(data || []);
  };

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    supabase.auth.getUser().then(async ({ data: userData }) => {
      const uid = userData.user?.id;
      if (uid) {
        setCurrentUserId(uid);
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("role_code")
          .eq("user_id", uid)
          .in("role_code", ["HR_Manager", "admin"]);
        setCanManage((roleRows?.length ?? 0) > 0);
      }
      await fetchHolidays(selectedYear);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    fetchHolidays(selectedYear);
  }, [selectedYear]);

  // ── Group by month ─────────────────────────────────────────────────────────
  const grouped = holidays.reduce<Record<string, PublicHoliday[]>>((acc, h) => {
    const month = h.holiday_date.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(h);
    return acc;
  }, {});

  // ── Add handlers ───────────────────────────────────────────────────────────
  const openAdd = () => {
    setAddName("");
    setAddDates([""]);
    setAddNote("");
    setAddError(null);
    setShowAddForm(true);
  };

  const saveAdd = async () => {
    const validDates = addDates.filter(Boolean);
    if (!addName.trim()) { setAddError("Name is required."); return; }
    if (validDates.length === 0) { setAddError("At least one date is required."); return; }
    setAddSaving(true);
    setAddError(null);
    const supabase = createClient();
    const rows = validDates.map((d) => ({
      holiday_date: d,
      holiday_name: addName.trim(),
      year: selectedYear,
      note: addNote.trim() || null,
      is_active: true,
      created_by: currentUserId || undefined,
    }));
    const { error } = await supabase.from("leave_public_holidays").insert(rows);
    if (error) {
      setAddError(error.message);
    } else {
      await fetchHolidays(selectedYear);
      setShowAddForm(false);
    }
    setAddSaving(false);
  };

  // ── Edit handlers ──────────────────────────────────────────────────────────
  const openEdit = (h: PublicHoliday) => {
    setEditingHoliday(h);
    setEditForm({ holiday_date: h.holiday_date, holiday_name: h.holiday_name, year: h.year, is_active: h.is_active, note: h.note ?? "" });
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editForm.holiday_date) { setEditError("Date is required."); return; }
    if (!editForm.holiday_name.trim()) { setEditError("Name is required."); return; }
    if (!editingHoliday) return;
    setEditSaving(true);
    setEditError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("leave_public_holidays")
      .update({ holiday_date: editForm.holiday_date, holiday_name: editForm.holiday_name.trim(), is_active: editForm.is_active, note: editForm.note.trim() || null })
      .eq("id", editingHoliday.id);
    if (error) {
      setEditError(error.message);
    } else {
      await fetchHolidays(selectedYear);
      setEditingHoliday(null);
    }
    setEditSaving(false);
  };

  // ── Delete handler ─────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deletingHoliday) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const supabase = createClient();
    const { error } = await supabase.from("leave_public_holidays").delete().eq("id", deletingHoliday.id);
    if (error) {
      setDeleteError(error.message);
    } else {
      setHolidays((prev) => prev.filter((h) => h.id !== deletingHoliday.id));
      setDeletingHoliday(null);
    }
    setDeleteLoading(false);
  };

  // ── Roll-forward handler ───────────────────────────────────────────────────
  const rollForward = async () => {
    setRollLoading(true);
    setRollError(null);
    const nextYear = selectedYear + 1;
    const supabase = createClient();
    const rows = holidays.map((h) => {
      const d = new Date(h.holiday_date);
      const nextDate = `${nextYear}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return {
        holiday_date: nextDate,
        holiday_name: h.holiday_name,
        year: nextYear,
        is_active: h.is_active,
        note: h.note,
        created_by: currentUserId || undefined,
      };
    });
    const { error } = await supabase.from("leave_public_holidays").insert(rows);
    if (error) {
      setRollError(error.message.includes("unique") ? `Some holidays already exist in ${nextYear}. Remove duplicates first.` : error.message);
    } else {
      setShowRollForward(false);
      setSelectedYear(nextYear);
    }
    setRollLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="leave-page-header flex items-start justify-between">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Public Holidays</h2>
          <p className="text-muted-foreground">Cambodia — {selectedYear} national public holidays</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Year selector */}
          <div className="flex gap-1">
            {YEAR_OPTS.map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  selectedYear === yr
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {canManage && selectedYear < 2030 && holidays.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => { setRollError(null); setShowRollForward(true); }} className="gap-1.5">
              Copy to {selectedYear + 1}
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Holiday
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading holidays...</div>
      ) : holidays.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No public holidays configured for {selectedYear}.{" "}
            {canManage ? 'Click "Add Holiday" to create one.' : "Contact HR to set them up."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(grouped).map(([month, items]) => {
            const [year, m] = month.split("-");
            const monthName = MONTHS[parseInt(m) - 1];
            return (
              <Card key={month}>
                <CardContent className="pt-4">
                  <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                    {monthName} {year}
                  </h3>
                  <div className="space-y-2">
                    {items.map((h) => {
                      const d = new Date(h.holiday_date);
                      return (
                        <div key={h.id} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{h.holiday_name}</p>
                            {h.note && (
                              <p className="text-xs text-muted-foreground mt-0.5">{h.note}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} — {DAYS[d.getDay()]}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">National</Badge>
                            {canManage && (
                              <>
                                <button
                                  onClick={() => openEdit(h)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => { setDeletingHoliday(h); setDeleteError(null); }}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        * Lunar-based holidays (Pchum Ben, Water Festival) are subject to official government announcement and may shift by ±1 day.
      </p>

      {/* ── Add Holiday Modal ──────────────────────────────────────────────────── */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-base font-semibold">Add Public Holiday</h3>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className={labelCls}>Holiday Name</label>
                <input
                  className={inputCls}
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. National Independence Day"
                />
              </div>

              {/* Dates — multi */}
              <div>
                <label className={labelCls}>Dates</label>
                <div className="space-y-2">
                  {addDates.map((d, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="date"
                        className={cn(inputCls, "flex-1")}
                        value={d}
                        onChange={(e) => {
                          const next = [...addDates];
                          next[i] = e.target.value;
                          setAddDates(next);
                        }}
                      />
                      {addDates.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setAddDates(addDates.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAddDates([...addDates, ""])}
                    className="text-sm text-primary hover:underline"
                  >
                    ＋ Add another date
                  </button>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className={labelCls}>Note <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  placeholder="e.g. Subject to official government announcement"
                />
              </div>

              {addError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{addError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button onClick={saveAdd} disabled={addSaving}>
                {addSaving ? "Saving..." : `Save ${addDates.filter(Boolean).length > 1 ? `(${addDates.filter(Boolean).length} holidays)` : ""}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────────── */}
      {editingHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-base font-semibold">Edit Public Holiday</h3>
              <button onClick={() => setEditingHoliday(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Date */}
              <div>
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={editForm.holiday_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, holiday_date: e.target.value }))}
                />
              </div>

              {/* Name */}
              <div>
                <label className={labelCls}>Holiday Name</label>
                <input
                  className={inputCls}
                  value={editForm.holiday_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, holiday_name: e.target.value }))}
                />
              </div>

              {/* Note */}
              <div>
                <label className={labelCls}>Note <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Subject to official government announcement"
                />
              </div>

              {/* Active */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-medium text-foreground">Active</span>
                <Toggle
                  checked={editForm.is_active}
                  onChange={(v) => setEditForm((f) => ({ ...f, is_active: v }))}
                />
              </div>

              {editError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{editError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setEditingHoliday(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Roll-Forward Confirmation ─────────────────────────────────────────── */}
      {showRollForward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm">
            <div className="px-6 py-5 space-y-3">
              <h3 className="text-base font-semibold">Copy to {selectedYear + 1}</h3>
              <p className="text-sm text-muted-foreground">
                This will copy all <span className="font-medium text-foreground">{holidays.length} holidays</span> from{" "}
                <span className="font-medium text-foreground">{selectedYear}</span> into{" "}
                <span className="font-medium text-foreground">{selectedYear + 1}</span>, keeping the same month and day.
                You can edit individual dates afterward for any that shift.
              </p>
              {rollError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{rollError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowRollForward(false)} disabled={rollLoading}>Cancel</Button>
              <Button onClick={rollForward} disabled={rollLoading}>
                {rollLoading ? "Copying..." : `Copy ${holidays.length} holidays`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ────────────────────────────────────────────────── */}
      {deletingHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Delete public holiday</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Delete <span className="font-medium text-foreground">{deletingHoliday.holiday_name}</span> (
                    {new Date(deletingHoliday.holiday_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})?
                    This cannot be undone.
                  </p>
                </div>
              </div>
              {deleteError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{deleteError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setDeletingHoliday(null)} disabled={deleteLoading}>Cancel</Button>
              <Button onClick={confirmDelete} disabled={deleteLoading} className="bg-red-600 hover:bg-red-700 text-white">
                {deleteLoading ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
