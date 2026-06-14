// Top-right user menu: avatar/initialer + roll + dropdown med profilval.
import { useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronDown, LogOut, User, KeyRound, Bell, Image as ImageIcon, Monitor, Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { useTheme } from "@/components/theme-provider";

type Profile = { name: string | null; email: string | null; avatar_url: string | null };

function roleLabel(role: string | null): string {
  if (role === "admin") return "Admin";
  if (role === "dealer") return "Handlare";
  return "Säljare";
}

function initials(name: string | null, email: string | null): string {
  const base = name || email || "?";
  return base
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function UserMenu() {
  const router = useRouter();
  const { role } = useUserRole();
  const { setTheme } = useTheme();
  const [profile, setProfile] = useState<Profile>({ name: null, email: null, avatar_url: null });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("name, email, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      if (active && data) setProfile(data as Profile);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 px-2">
          <Avatar className="h-7 w-7">
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback className="text-xs">{initials(profile.name, profile.email)}</AvatarFallback>
          </Avatar>
          <span className="hidden md:flex flex-col items-start leading-tight">
            <span className="text-sm font-medium">{profile.name ?? profile.email ?? "Användare"}</span>
            <span className="text-[10px] text-muted-foreground">{roleLabel(role)}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{profile.name ?? "Användare"}</span>
            <span className="text-xs text-muted-foreground">{profile.email}</span>
            <span className="text-xs text-muted-foreground">{roleLabel(role)}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/installningar/profil"><User className="mr-2 h-4 w-4" /> Min profil</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/installningar/profil" hash="losenord"><KeyRound className="mr-2 h-4 w-4" /> Byt lösenord</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/installningar/profil" hash="bild"><ImageIcon className="mr-2 h-4 w-4" /> Profilbild</Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="mr-2 h-4 w-4" /> Tema
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="mr-2 h-4 w-4" /> Ljust läge
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="mr-2 h-4 w-4" /> Mörkt läge
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="mr-2 h-4 w-4" /> Följ system
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {role === "admin" && (
          <DropdownMenuItem asChild>
            <Link to="/admin/settings/notifications"><Bell className="mr-2 h-4 w-4" /> Notisinställningar</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Logga ut
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
