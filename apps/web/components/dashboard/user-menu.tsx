"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Loader2, LayoutGrid } from "lucide-react";
import { getProfileById } from "@/lib/dashboard/dashboard-queries";

interface Profile {
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
}

export function UserMenu() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { signOut, loading } = useSupabaseAuth();

  useEffect(() => {
    const supabase = createClient();

    const fetchProfile = () => {
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) return;

        getProfileById(data.user.id, "full_name, email, role, avatar_url")
          .then(({ data: profileData }) => {
            if (profileData) {
              setProfile(profileData as Profile);
              setIsAdmin(profileData.role === "admin");
            }
          });
      });
    };

    fetchProfile();

    const onProfileUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ avatar_url?: string | null }>).detail;
      if (detail && "avatar_url" in detail) {
        setProfile((prev) => (prev ? { ...prev, avatar_url: detail.avatar_url ?? null } : prev));
      } else {
        fetchProfile();
      }
    };
    window.addEventListener("dcos:profile-updated", onProfileUpdated);
    return () => window.removeEventListener("dcos:profile-updated", onProfileUpdated);
  }, [profile?.avatar_url]);

  const initials = profile
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors">
          <Avatar className="h-8 w-8">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.full_name ?? "User"}
                className="aspect-square size-full rounded-full object-cover"
              />
            ) : (
              <AvatarFallback>{initials}</AvatarFallback>
            )}
          </Avatar>
          <div className="hidden text-left md:block">
            <p className="text-sm font-medium leading-tight text-foreground">
              {profile?.full_name ?? "User"}
            </p>
            <p className="text-xs leading-tight text-muted-foreground capitalize">
              {profile?.role ?? "Loading..."}
            </p>
          </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Avatar className="h-9 w-9 shrink-0">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.full_name ?? "User"}
                className="aspect-square size-full rounded-full object-cover"
              />
            ) : (
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile?.full_name ?? "User"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.email ?? ""}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard/profile")}>
          <User className="h-4 w-4" />
          Profile Settings
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={() => router.push("/dashboard/settings?tab=modules")}>
            <LayoutGrid className="h-4 w-4" />
            Module Visibility
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} variant="destructive">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
