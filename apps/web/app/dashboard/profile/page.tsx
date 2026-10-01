"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationPreferencesPanel } from "@/components/settings/notification-preferences-panel";
import { ChangePasswordCard } from "@/components/settings/change-password-card";
import { ProfileAccountInfoCard, type AccountInfoFields } from "@/components/settings/profile-account-info-card";
import { PersonalInfoCard, type PersonalInfoFields } from "@/components/settings/personal-info-card";
import { getProfileById, listDepartments } from "@/lib/profile/profile-queries";

interface DepartmentOption {
  id: string;
  department_name: string;
}

type OwnProfile = AccountInfoFields & PersonalInfoFields & { id: string };

export default function ProfilePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  async function load(uid: string) {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [{ data, error: err }, { data: depts }] = await Promise.all([
      getProfileById(uid),
      listDepartments(),
    ]);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setProfile(data as OwnProfile);
    setDepartments((depts ?? []) as DepartmentOption[]);
    setLoading(false);
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/");
        return;
      }
      setChecking(false);
      setUserId(data.session.user.id);
      load(data.session.user.id);
    });
  }, [router]);

  function handlePersonalInfoSaved(fields: PersonalInfoFields) {
    setProfile((prev) => (prev ? { ...prev, ...fields } : prev));
  }

  if (checking || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !profile || !userId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm text-destructive">{error ?? "Failed to load your profile"}</p>
        <Button variant="outline" size="sm" onClick={() => userId && load(userId)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          View your account details and manage your personal information, notifications, and security
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProfileAccountInfoCard profile={profile} departments={departments} />
        <PersonalInfoCard userId={userId} initial={profile} onSaved={handlePersonalInfoSaved} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NotificationPreferencesPanel />
        <ChangePasswordCard />
      </div>
    </div>
  );
}
