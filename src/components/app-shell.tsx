import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell, Inbox, LayoutDashboard, MessageSquare, Search, Settings, Link2,
  Gauge, Calendar, Store, BarChart3, Receipt, ScrollText, Shield, FileSpreadsheet,
  Webhook, Users, ListChecks, ChevronDown, Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { useUserRole } from "@/hooks/use-user-role";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import logoUrl from "@/assets/logo.png";

type Item = { to: string; label: string; icon: any; adminOnly?: boolean; hash?: string; search?: Record<string, string> };
type Group = { label: string; icon: any; items: Item[]; adminOnly?: boolean };

const dashboard: Item = { to: "/", label: "Dashboard", icon: LayoutDashboard };

const groups: Group[] = [
  {
    label: "Leads", icon: ListChecks, items: [
      { to: "/", label: "Alla leads", icon: ListChecks },
    ],
  },
  {
    label: "Kommunikation", icon: MessageSquare, items: [
      { to: "/inkorg", label: "Inkorg", icon: Inbox },
      { to: "/admin/settings/followups", label: "Uppföljnings-SMS", icon: MessageSquare, adminOnly: true },
      { to: "/admin/settings/sms-templates", label: "SMS-mallar", icon: MessageSquare, adminOnly: true },
      { to: "/admin/orphan-sms", label: "Orphan SMS", icon: Inbox, adminOnly: true },
    ],
  },
  {
    label: "Uppgifter", icon: Calendar, items: [
      { to: "/kalender", label: "Kalender", icon: Calendar },
    ],
  },
  {
    label: "Handlare", icon: Store, items: [
      { to: "/admin/dealers", label: "Handlare", icon: Store, adminOnly: true },
    ],
  },
  {
    label: "Konton", icon: Users, adminOnly: true, items: [
      { to: "/admin/permissions", label: "Behörigheter & konton", icon: Users, adminOnly: true },
    ],
  },
  {
    label: "Rapporter", icon: BarChart3, adminOnly: true, items: [
      { to: "/rapporter", label: "Rapporter", icon: BarChart3 },
      { to: "/admin/fakturering", label: "Fakturering", icon: Receipt, adminOnly: true },
      { to: "/admin/exports", label: "Exporter", icon: FileSpreadsheet, adminOnly: true },
      { to: "/admin/audit", label: "Audit", icon: ScrollText, adminOnly: true },
      { to: "/admin/gdpr", label: "GDPR", icon: Shield, adminOnly: true },
      { to: "/admin/security", label: "Säkerhet", icon: Shield, adminOnly: true },
      { to: "/admin/test-lead-intake", label: "Testa lead-intag", icon: Webhook, adminOnly: true },
      { to: "/admin/data-cleanup", label: "Data-cleanup", icon: ListChecks, adminOnly: true },
    ],
  },
  {
    label: "Inställningar", icon: Settings, items: [
      { to: "/installningar/profil", label: "Min profil", icon: Users },
      { to: "/admin/settings/notifications", label: "Notiser", icon: Bell, adminOnly: true },
      { to: "/admin/settings/timing", label: "Tider", icon: Settings, adminOnly: true },
      { to: "/admin/settings/sla", label: "SLA-mål", icon: Gauge, adminOnly: true },
      { to: "/admin/settings/billing", label: "Fakt.inst.", icon: Receipt, adminOnly: true },
      { to: "/admin/settings/external-links", label: "Externa länkar", icon: Link2, adminOnly: true },
      { to: "/admin/settings/lead-score", label: "Lead-score", icon: Gauge, adminOnly: true },
      { to: "/admin/stage-rules", label: "Stegregler", icon: ListChecks, adminOnly: true },
    ],
  },
];

const isTestMode = import.meta.env.VITE_SMS_TEST_MODE === "true";

function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const visibleGroups = groups
    .filter((g) => !g.adminOnly || isAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="Dashboard">
                  <Link to="/" className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    {!collapsed && <span>{dashboard.label}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleGroups.map((g) => {
          const groupActive = g.items.some((i) => pathname.startsWith(i.to) && i.to !== "/");
          return (
            <CollapsibleGroup key={g.label} group={g} collapsed={collapsed} defaultOpen={groupActive} pathname={pathname} />
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}

function CollapsibleGroup({
  group, collapsed, defaultOpen, pathname,
}: { group: Group; collapsed: boolean; defaultOpen: boolean; pathname: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = group.icon;

  if (collapsed) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {group.items.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={pathname === item.to} tooltip={item.label}>
                  <Link to={item.to}>
                    <item.icon className="h-4 w-4" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground py-1"
      >
        <span className="flex items-center gap-2 uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />
          {group.label}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <SidebarGroupContent>
          <SidebarMenu>
            {group.items.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={pathname === item.to}>
                  <Link to={item.to} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role } = useUserRole();
  const [defaultOpen, setDefaultOpen] = useState(false);
  const navigate = useNavigate();
  const currentSearch = useRouterState({ select: (r) => r.location.search as Record<string, unknown> });
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const initialQ = currentPath === "/" && typeof currentSearch?.q === "string" ? (currentSearch.q as string) : "";
  const [searchValue, setSearchValue] = useState(initialQ);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep input in sync if URL changes externally (e.g. back/forward, clearing).
  useEffect(() => {
    setSearchValue(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("sidebar_state");
      if (v === "open") setDefaultOpen(true);
    } catch { /* ignore */ }
  }, []);

  const runSearch = (raw: string) => {
    const q = raw.trim();
    navigate({ to: "/", search: (prev: any) => ({ ...prev, q: q || undefined, stage: undefined }) });
  };

  const onSearchChange = (val: string) => {
    setSearchValue(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(val), 250);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchTimer.current) clearTimeout(searchTimer.current);
      runSearch(searchValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSearchValue("");
      if (searchTimer.current) clearTimeout(searchTimer.current);
      runSearch("");
    }
  };

  return (
    <SidebarProvider defaultOpen={defaultOpen} open={undefined} onOpenChange={(o) => {
      try { window.localStorage.setItem("sidebar_state", o ? "open" : "closed"); } catch { /* ignore */ }
    }}>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AppSidebar isAdmin={role === "admin"} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="h-full flex items-center gap-3 px-4 md:px-6">
              <SidebarTrigger className="md:flex">
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Till startsidan">
                <img src={logoUrl} alt="Min Bil Värdering" className="h-7 w-auto" />
              </Link>
              <div className="flex-1 max-w-xl relative ml-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök leads, regnr, telefon…"
                  className="pl-9 h-9 bg-elevated border-border"
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                />
              </div>
              {isTestMode && (
                <Badge variant="outline" className="text-amber-500 border-amber-500/40 hidden sm:inline-flex">
                  TESTLÄGE
                </Badge>
              )}
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/leads/ny">+ Nytt lead</Link>
              </Button>
              <ThemeToggle />
              <NotificationBell />
              <UserMenu />
            </div>
          </header>

          <main className="p-4 md:p-6 flex-1">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
