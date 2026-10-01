"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save } from "lucide-react";
import { Field, NativeSelect } from "./fields";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function PersonalTab({ c }: { c: LoadedEmployeeDetail }) {
  const { saving, isArchived, profileForm, setProfileForm, savePersonal } = c;
  return (
    <TabsContent value="personal" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Full Name (English)">
            <Input value={profileForm.full_name ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, full_name: e.target.value }))} />
          </Field>
          <Field label="Khmer Name">
            <Input value={profileForm.khmer_name ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, khmer_name: e.target.value }))} />
          </Field>
          <Field label="Gender">
            <NativeSelect value={profileForm.gender ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, gender: v }))} placeholder="—">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </NativeSelect>
          </Field>
          <Field label="Date of Birth">
            <Input type="date" value={profileForm.date_of_birth ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, date_of_birth: e.target.value }))} />
          </Field>
          <Field label="Nationality">
            <Input value={(profileForm as Record<string, unknown>).nationality as string ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, nationality: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={profileForm.phone ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Current Address">
              <Input
                value={profileForm.current_address ?? profileForm.address ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, current_address: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Emergency Contact">
            <Input value={profileForm.emergency_contact_name ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_name: e.target.value }))} />
          </Field>
          <Field label="Emergency Relationship">
            <Input value={profileForm.emergency_contact_relationship ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_relationship: e.target.value }))} />
          </Field>
          <Field label="Emergency Phone">
            <Input value={profileForm.emergency_contact_phone ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_phone: e.target.value }))} />
          </Field>
          <Field label="Emergency Address">
            <Input value={profileForm.emergency_contact_address ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_address: e.target.value }))} />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={savePersonal} disabled={saving || isArchived} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
