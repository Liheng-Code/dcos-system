"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, PackageCheck } from "lucide-react";
import { Field } from "./fields";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function AttendanceAssetsTab({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, isArchived, profileForm, setProfileForm, saveAttendanceAssets } = c;
  return (
    <TabsContent value="attendance-assets" className="mt-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold"><PackageCheck className="h-4 w-4" /> Leave, Attendance, Asset & Access Setup</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Leave Group"><Input value={profileForm.leave_group ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, leave_group: e.target.value }))} /></Field>
          <Field label="Payroll Group"><Input value={profileForm.payroll_group ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, payroll_group: e.target.value }))} /></Field>
          <Field label="Attendance Site"><Input value={profileForm.attendance_site ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, attendance_site: e.target.value }))} /></Field>
          <Field label="Shift / Work Calendar"><Input value={profileForm.shift_group ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, shift_group: e.target.value }))} /></Field>
          <Field label="RFID Card"><Input value={profileForm.rfid_card ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, rfid_card: e.target.value }))} /></Field>
          <Field label="Fingerprint ID"><Input value={profileForm.fingerprint_id ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, fingerprint_id: e.target.value }))} /></Field>
          <Field label="Face Recognition ID"><Input value={profileForm.face_recognition_id ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, face_recognition_id: e.target.value }))} /></Field>
          <Field label="Door Access Group"><Input value={profileForm.door_access_group ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, door_access_group: e.target.value }))} /></Field>
          <Field label="Parking Access"><Input value={profileForm.parking_access ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, parking_access: e.target.value }))} /></Field>
          <Field label="Shirt Size"><Input value={profileForm.shirt_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, shirt_size: e.target.value }))} /></Field>
          <Field label="Pant Size"><Input value={profileForm.pant_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, pant_size: e.target.value }))} /></Field>
          <Field label="Safety Shoe Size"><Input value={profileForm.safety_shoe_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, safety_shoe_size: e.target.value }))} /></Field>
          <Field label="Helmet Size"><Input value={profileForm.helmet_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, helmet_size: e.target.value }))} /></Field>
          <Field label="Vest Size"><Input value={profileForm.vest_size ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, vest_size: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end"><Button onClick={saveAttendanceAssets} disabled={saving || isArchived} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Setup</Button></div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
