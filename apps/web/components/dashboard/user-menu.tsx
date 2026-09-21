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

interface Profile {
  full_name: string;
  email: string;
  role: string;
}

export function UserMenu() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { signOut, loading } = useSupabaseAuth();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;

      supabase
        .from("profiles")
        .select("full_name, email, role")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profileData }) => {
          if (profileData) {
            setProfile(profileData);
            setIsAdmin(profileData.role === "admin");
          }
        });
    });
  }, []);

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
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
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
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2">
          <p className="text-sm font-medium">{profile?.full_name ?? "User"}</p>
          <p className="text-xs text-muted-foreground">
            {profile?.email ?? ""}
          </p>
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
