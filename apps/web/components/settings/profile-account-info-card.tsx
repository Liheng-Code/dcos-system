"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Check, HardHat, IdCard, Loader2, Trash2, Upload } from "lucide-react";
import { updateProfileById } from "@/lib/settings/settings-queries";
import type { AccountStatus } from "@/lib/admin-users/admin-users-service";
import { PRESET_ENGINEER_AVATARS } from "@/components/settings/preset-engineer-avatars";

export interface AccountInfoFields {
  employee_id: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  department_id: string | null;
  job_title: string | null;
  role: string;
  account_status: AccountStatus;
  last_login_at: string | null;
  // Read-only here (not in personal-info-card.tsx's self-editable set): both carry
  // legal/compliance weight (KYC, work permits/visas elsewhere on `profiles`) and should be
  // HR/Admin-mediated via staff-edit-sheet.tsx, not free self-service text — same reasoning
  // already used to exclude passport/visa/national-ID fields from self-edit.
  date_of_birth: string | null;
  nationality: string | null;
}

interface DepartmentOption {
  id: string;
  department_name: string;
}

interface ProfileAccountInfoCardProps {
  userId: string;
  profile: AccountInfoFields;
  departments: DepartmentOption[];
  onAvatarChanged?: (avatarUrl: string | null) => void;
}

// Mirrors staff-edit-sheet.tsx's ACCOUNT_STATUS_COLORS (USR-04 badge convention) — duplicated
// locally rather than imported since neither staff-edit-sheet.tsx nor staff-list-page.tsx
// exports it (both already duplicate this map themselves).
const ACCOUNT_STATUS_COLORS: Record<AccountStatus, string> = {
  INVITED: "bg-amber-500/10 text-amber-600 border-amber-200",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  LOCKED: "bg-red-500/10 text-red-600 border-red-200",
  SUSPENDED: "bg-orange-500/10 text-orange-600 border-orange-200",
  DISABLED: "bg-gray-500/10 text-gray-500 border-gray-200",
};

// Mirrors staff-edit-sheet.tsx's formatDateTime().
function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

// Mirrors staff-edit-sheet.tsx's ROLES <option> humanization.
function humanizeRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

/** Center-crops and resizes an image file to a 256×256 square JPEG Data URL. */
function cropImageToSquareDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image format"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas is not supported"));
          return;
        }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

export function ProfileAccountInfoCard({
  userId,
  profile,
  departments,
  onAvatarChanged,
}: ProfileAccountInfoCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");

  const departmentName =
    departments.find((d) => d.id === profile.department_id)?.department_name ?? "—";

  const filteredPresets = PRESET_ENGINEER_AVATARS.filter(
    (a) => genderFilter === "all" || a.gender === genderFilter,
  );

  async function saveAvatar(nextAvatarUrl: string | null) {
    setUploadingAvatar(true);
    const { error } = await updateProfileById({ avatar_url: nextAvatarUrl }, userId);
    setUploadingAvatar(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onAvatarChanged?.(nextAvatarUrl);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("dcos:profile-updated", { detail: { avatar_url: nextAvatarUrl } }),
      );
    }
    toast.success(nextAvatarUrl ? "Profile avatar updated" : "Profile avatar removed");
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (JPG, PNG, or WebP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image file must be smaller than 10 MB");
      return;
    }
    try {
      setUploadingAvatar(true);
      const dataUrl = await cropImageToSquareDataUrl(file, 256);
      await saveAvatar(dataUrl);
    } catch (err) {
      setUploadingAvatar(false);
      toast.error(err instanceof Error ? err.message : "Failed to process image");
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <IdCard className="h-4 w-4 text-muted-foreground" />
          Account Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Profile Avatar Section */}
        <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative group">
              <Avatar className="h-16 w-16 ring-2 ring-white shadow-sm">
                <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name} className="object-cover" />
                <AvatarFallback className="bg-primary/10 text-base font-bold text-primary">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-xs transition-colors hover:bg-primary hover:text-white disabled:opacity-50"
                title="Change avatar photo"
                aria-label="Change avatar photo"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{profile.full_name}</p>
              <p className="text-xs text-muted-foreground">
                Upload a custom photo or choose a discipline engineer avatar
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingAvatar ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Upload Photo
                </Button>
                <Button
                  type="button"
                  variant={showPresetPicker ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  disabled={uploadingAvatar}
                  onClick={() => setShowPresetPicker((v) => !v)}
                >
                  <HardHat className="mr-1.5 h-3.5 w-3.5" />
                  Engineer Avatars
                </Button>
                {profile.avatar_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={uploadingAvatar}
                    onClick={() => void saveAvatar(null)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          {showPresetPicker && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  Select Discipline Avatar (Civil, MEP, Architecture, QS, PM, HSE)
                </span>
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[11px]">
                  {(
                    [
                      { id: "all", label: "All (12)" },
                      { id: "male", label: "Boy / Male" },
                      { id: "female", label: "Girl / Female" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setGenderFilter(tab.id)}
                      className={cn(
                        "rounded px-2 py-0.5 font-medium transition-colors",
                        genderFilter === tab.id
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {filteredPresets.map((item) => {
                  const isSelected = profile.avatar_url === item.dataUrl;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={uploadingAvatar}
                      onClick={() => void saveAvatar(item.dataUrl)}
                      className={cn(
                        "group relative flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-slate-200/80 bg-slate-50/40 hover:border-primary/40 hover:bg-slate-50",
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-12 w-12 shadow-2xs">
                          <AvatarImage src={item.dataUrl} alt={item.label} className="object-cover" />
                          <AvatarFallback className="text-[10px]">{item.discipline.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        {isSelected && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                      <span className="w-full truncate text-[11px] font-semibold text-slate-800">
                        {item.discipline}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {item.gender === "male" ? "Male" : "Female"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <InfoRow label="Employee ID">{profile.employee_id ?? "—"}</InfoRow>
          <InfoRow label="Full Name">{profile.full_name}</InfoRow>
          <InfoRow label="Email">{profile.email}</InfoRow>
          <InfoRow label="Department">{departmentName}</InfoRow>
          <InfoRow label="Position / Job Title">{profile.job_title ?? "—"}</InfoRow>
          <InfoRow label="Role">{humanizeRole(profile.role)}</InfoRow>
          <InfoRow label="Account Status">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                ACCOUNT_STATUS_COLORS[profile.account_status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
              )}
            >
              {profile.account_status ?? "—"}
            </span>
          </InfoRow>
          <InfoRow label="Last Login">{formatDateTime(profile.last_login_at)}</InfoRow>
          <InfoRow label="Date of Birth">{formatDate(profile.date_of_birth)}</InfoRow>
          <InfoRow label="Nationality">{profile.nationality ?? "—"}</InfoRow>
        </div>
      </CardContent>
    </Card>
  );
}
