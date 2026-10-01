"use client";

import { STANDARD_POSITION_GROUPS, isStandardPositionName } from "@/lib/hr/standard-positions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, CheckCircle2 } from "lucide-react";
import { Field, NativeSelect } from "./fields";
import { labelize, fmtDate } from "./format";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function EmploymentTab({ c }: { c: LoadedEmployeeDetail }) {
  const { id, saving, isArchived, allProfiles, profileForm, setProfileForm, setShowConfirmDialog, saveEmployment } = c;
  return (
    <TabsContent value="employment" className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Employment Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Employee ID (HR Assigned)">
              <Input value={profileForm.employee_id ?? ""} disabled placeholder="Generated after join date is saved" />
            </Field>
          </div>
          <Field label="Department">
            <NativeSelect value={profileForm.department ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, department: v }))} placeholder="Select department">
              {["Management", "Architecture", "Structure", "MEP", "Procurement", "Quantity Surveying", "Construction", "Account & Finance", "HR & Admin"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Job Title / Position">
            <NativeSelect value={profileForm.job_title ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, job_title: v }))} placeholder="Select position">
              {profileForm.job_title && !isStandardPositionName(profileForm.job_title) && (
                <option value={profileForm.job_title}>{profileForm.job_title} (Current)</option>
              )}
              {STANDARD_POSITION_GROUPS.map(({ group, positions }) => (
                <optgroup key={group} label={group}>
                  {positions.map((position) => (
                    <option key={position.code} value={position.name}>
                      {position.code} - {position.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <div className="md:col-span-2">
            <Field label="Email">
              <Input type="email" value={profileForm.email ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
            </Field>
          </div>
          <Field label="Line Manager">
            <NativeSelect value={profileForm.report_to ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, report_to: v }))} placeholder="—">
              {allProfiles.filter((p) => p.id !== id).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Employment Type">
            <NativeSelect value={profileForm.employment_type ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, employment_type: v }))} placeholder="—">
              {["permanent", "contract", "temporary", "intern"].map((t) => (
                <option key={t} value={t}>{labelize(t)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Grade">
            <NativeSelect value={profileForm.grade ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, grade: v }))} placeholder="—">
              {["L1", "L2", "L3", "L4", "L5", "L6"].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Join Date">
            <Input type="date" value={profileForm.join_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, join_date: e.target.value }))} />
          </Field>
          <Field label="Work Location">
            <NativeSelect value={(profileForm as Record<string, unknown>).work_location as string ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, work_location: v }))} placeholder="—">
              {["office", "site", "hybrid"].map((l) => <option key={l} value={l}>{labelize(l)}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Company">
            <Input value={profileForm.company ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, company: e.target.value }))} />
          </Field>
          <Field label="Division">
            <Input value={profileForm.division ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, division: e.target.value }))} />
          </Field>
          <Field label="Section">
            <Input value={profileForm.section ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, section: e.target.value }))} />
          </Field>
          <Field label="Cost Center">
            <Input value={profileForm.cost_center ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, cost_center: e.target.value }))} />
          </Field>
          <Field label="Employment Category">
            <NativeSelect value={profileForm.employment_category ?? ""} onChange={(v) => setProfileForm((p) => ({ ...p, employment_category: v }))} placeholder="Select category">
              {["executive", "management", "professional", "technical", "administration", "site_staff", "labor", "intern"].map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Labor Category">
            <Input value={profileForm.labor_category ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, labor_category: e.target.value }))} />
          </Field>
          <Field label="Contract Start Date">
            <Input type="date" value={profileForm.contract_start_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, contract_start_date: e.target.value }))} />
          </Field>
          <Field label="Contract End Date">
            <Input type="date" value={profileForm.contract_end_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, contract_end_date: e.target.value }))} />
          </Field>
          <Field label="Seniority Start Date">
            <Input type="date" value={profileForm.seniority_start_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, seniority_start_date: e.target.value }))} />
          </Field>
          <Field label="Probation Status">
            <NativeSelect value={profileForm.probation_status ?? "not_applicable"} onChange={(v) => setProfileForm((p) => ({ ...p, probation_status: v }))}>
              {["not_applicable", "active", "completed", "extended", "failed"].map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Probation End Date">
            <Input type="date" value={profileForm.probation_end_date ?? ""} onChange={(e) => setProfileForm((p) => ({ ...p, probation_end_date: e.target.value }))} />
          </Field>
          {profileForm.probation_status === "active" && (
            <div className="md:col-span-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-amber-800">Probation In Progress</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {profileForm.probation_end_date
                        ? `Probation ends ${fmtDate(profileForm.probation_end_date)}`
                        : "No probation end date set"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowConfirmDialog(true)}
                    className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirm Probation
                  </Button>
                </div>
              </div>
            </div>
          )}
          <Field label="Status">
            <NativeSelect value={profileForm.status ?? "active"} onChange={(v) => setProfileForm((p) => ({ ...p, status: v }))}>
              {["active", "inactive", "resigned", "terminated"].map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
            </NativeSelect>
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={saveEmployment} disabled={saving || isArchived} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
