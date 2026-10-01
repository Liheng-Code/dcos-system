"use client";

import { useEffect, useState } from "react";
import { insertDesignArcRoomData, listDesignArcRoomData, updateDesignArcRoomDataById } from "@/lib/design/design-queries";
import { Search, Plus, Loader2, Pencil, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface RoomData {
  id: string; room_no: string; room_name: string; level: string | null;
  area_sqm: number | null; floor_finish: string | null; wall_finish: string | null;
  ceiling_finish: string | null; status: string;
}

export function ArcRoomDataSheet() {
  const [items, setItems] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RoomData | null>(null);

  function load() {
    setLoading(true);
    listDesignArcRoomData().then(({ data }) => { if (data) setItems(data as RoomData[]); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter(r => r.room_no.toLowerCase().includes(search.toLowerCase()) || r.room_name.toLowerCase().includes(search.toLowerCase()));

  if (showForm) return <ArcRoomDataForm item={editing} onSaved={() => { setShowForm(false); setEditing(null); load(); }} onCancel={() => { setShowForm(false); setEditing(null); }} />;
  if (loading) return <Loader2 className="h-8 w-8 animate-spin mx-auto py-20" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search rooms..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2"><Plus className="h-4 w-4" /> New Room</Button>
      </div>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="text-left px-4 py-2">Room No</th><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">Level</th><th className="text-right px-4 py-2">Area</th><th className="text-left px-4 py-2">Floor</th><th className="text-left px-4 py-2">Wall</th><th className="text-left px-4 py-2">Ceiling</th><th className="text-right px-4 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No room data found.</td></tr>
            : filtered.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">{r.room_no}</td>
                <td className="px-4 py-2">{r.room_name}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{r.level ?? "—"}</td>
                <td className="px-4 py-2 text-right text-xs">{r.area_sqm ? `${r.area_sqm}m²` : "—"}</td>
                <td className="px-4 py-2 text-xs">{r.floor_finish ?? "—"}</td>
                <td className="px-4 py-2 text-xs">{r.wall_finish ?? "—"}</td>
                <td className="px-4 py-2 text-xs">{r.ceiling_finish ?? "—"}</td>
                <td className="px-4 py-2 text-right"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditing(r); setShowForm(true); }}><Pencil className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArcRoomDataForm({ item, onSaved, onCancel }: { item: RoomData | null; onSaved: () => void; onCancel: () => void }) {
  const isNew = !item?.id;
  const [roomNo, setRoomNo] = useState(item?.room_no ?? "");
  const [roomName, setRoomName] = useState(item?.room_name ?? "");
  const [level, setLevel] = useState(item?.level ?? "");
  const [areaSqm, setAreaSqm] = useState(item?.area_sqm ?? 0);
  const [floorFinish, setFloorFinish] = useState(item?.floor_finish ?? "");
  const [wallFinish, setWallFinish] = useState(item?.wall_finish ?? "");
  const [ceilingFinish, setCeilingFinish] = useState(item?.ceiling_finish ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { room_no: roomNo, room_name: roomName, level: level || null, area_sqm: areaSqm || null, floor_finish: floorFinish || null, wall_finish: wallFinish || null, ceiling_finish: ceilingFinish || null };
    const { error } = isNew ? await insertDesignArcRoomData({ ...payload, project_id: crypto.randomUUID() }) : await updateDesignArcRoomDataById(payload, item!.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(isNew ? "Room data created" : "Updated");
    setSaving(false); onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button><h2 className="text-lg font-semibold">{isNew ? "New Room Data" : "Edit Room Data"}</h2></div>
      <Card><CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Room No</Label><Input value={roomNo} onChange={e => setRoomNo(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Room Name</Label><Input value={roomName} onChange={e => setRoomName(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Level</Label><Input value={level} onChange={e => setLevel(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Area (m²)</Label><Input type="number" step="0.01" value={areaSqm || ""} onChange={e => setAreaSqm(parseFloat(e.target.value) || 0)} /></div>
            <div className="space-y-1.5"><Label>Floor Finish</Label><Input value={floorFinish} onChange={e => setFloorFinish(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Wall Finish</Label><Input value={wallFinish} onChange={e => setWallFinish(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Ceiling Finish</Label><Input value={ceilingFinish} onChange={e => setCeilingFinish(e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : isNew ? "Create" : "Update"}</Button>
          </div>
        </form>
      </CardContent></Card>
    </div>
  );
}
