import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { ChevronDown, Filter, ArrowUpDown } from "lucide-react";
import { getStageGroupCounts, listLeads } from "@/lib/leads.functions";
import { getUnreadCounts } from "@/lib/leads-detail.functions";
import { getCompanySettings } from "@/lib/settings.functions";
import { listMyTasks, completeTask, snoozeTask } from "@/lib/tasks.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskRow } from "@/components/leads/tasks-panel";
import { LeadCard } from "@/components/leads/lead-card";
import { StageRibbon } from "@/components/dashboard/stage-ribbon";
import { InboxPanel } from "@/components/sms/inbox-panel";
import { useInboxRealtime } from "@/hooks/use-inbox-realtime";
import { BODY_TYPE_OPTIONS } from "@/lib/vehicle-enums";
import { STAGE_GROUPS, type StageGroup } from "@/lib/stage-groups";

const STAGE_GROUP_KEYS = STAGE_GROUPS.map((g) => g.key) as [StageGroup, ...StageGroup[]];

const searchSchema = z.object({
  stageGroup: z.enum(STAGE_GROUP_KEYS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — Min Bil Värdering" }] }),
  validateSearch: searchSchema,
  component: Dashboard,
});

function Dashboard() {
  useInboxRealtime();
  const { stageGroup, q: searchQuery } = Route.useSearch();
  const fetchCounts = useServerFn(getStageGroupCounts);
  const fetchLeads = useServerFn(listLeads);
  const fetchUnread = useServerFn(getUnreadCounts);
  const fetchTasks = useServerFn(listMyTasks);
  const fetchSettings = useServerFn(getCompanySettings);
  const completeFn = useServerFn(completeTask);
  const snoozeFn = useServerFn(snoozeTask);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [bodyFilter, setBodyFilter] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnSort, setColumnSort] = useState<Record<string, "asc" | "desc">>({
    overview: "asc",
    behover_varderas: "asc",
    kontakt_1: "asc",
    kontakt_2: "asc",
    kontakt_3: "asc",
    inget_svar: "asc",
    godkand_pris: "asc",
    publicerad: "asc",
    aktiv_affar: "asc",
    vunnen: "asc",
    forlorad: "asc",
    arkiv: "asc",
  });

  const countsQ = useQuery({ queryKey: ["stage-group-counts"], queryFn: () => fetchCounts() });
  const leadsQ = useQuery({
    queryKey: ["leads", stageGroup ?? "overview", bodyFilter.join(","), searchQuery ?? ""],
    queryFn: () =>
      fetchLeads({
        data: {
          ...(stageGroup ? { stageGroup } : {}),
          ...(bodyFilter.length ? { bodyTypes: bodyFilter } : {}),
          ...(searchQuery ? { q: searchQuery } : {}),
        } as any,
      }),
  });
  const unreadQ = useQuery({ queryKey: ["unread-counts"], queryFn: () => fetchUnread() });
  const settingsQ = useQuery({ queryKey: ["company-settings"], queryFn: () => fetchSettings() });
  const tasksQ = useQuery({
    queryKey: ["tasks-today"],
    queryFn: () => fetchTasks({ data: { scope: "today" } }),
    enabled: !stageGroup,
  });
  const invalidateTasks = () => qc.invalidateQueries({ queryKey: ["tasks-today"] });

  const groupMeta = stageGroup ? STAGE_GROUPS.find((g) => g.key === stageGroup) : null;

  // Sortera pinnade och olästa överst, sedan efter skapadetid
  const sortKey = stageGroup ?? "overview";
  const sortDir = columnSort[sortKey] ?? "asc";
  const sortedLeads = (() => {
    const list = leadsQ.data ?? [];
    const unread = unreadQ.data ?? {};
    return [...list].sort((a: any, b: any) => {
      const ap = !!a.is_pinned || !!a.pin_inbox_at;
      const bp = !!b.is_pinned || !!b.pin_inbox_at;
      if (ap !== bp) return ap ? -1 : 1;
      const au = unread[a.id] ?? 0;
      const bu = unread[b.id] ?? 0;
      if ((au > 0) !== (bu > 0)) return au > 0 ? -1 : 1;
      const ad = new Date(a.created_at).getTime();
      const bd = new Date(b.created_at).getTime();
      return sortDir === "asc" ? ad - bd : bd - ad;
    });
  })();

  return (
    <div className="space-y-4">
      {/* Sticky steg-band */}
      <StageRibbon counts={countsQ.data} active={stageGroup} />

      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {groupMeta ? groupMeta.label : searchQuery ? `Sökresultat` : "Dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {searchQuery
            ? `Söker efter "${searchQuery}"${(leadsQ.data?.length ?? 0) > 0 ? ` — ${leadsQ.data?.length} träffar` : ""}`
            : stageGroup
              ? `${leadsQ.data?.length ?? 0} ${(leadsQ.data?.length ?? 0) === 1 ? "lead" : "leads"} i detta steg`
              : "Operativ översikt av pipeline och SMS-inkorg."}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Vänster: leads dominerar */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter (kollapsad bakom knapp) */}
          <div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
            >
              <Filter className="h-3 w-3" />
              Filter {bodyFilter.length > 0 && <span className="text-foreground">({bodyFilter.length})</span>}
              <ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
            {filtersOpen && (
              <div className="mt-2 p-3 rounded border border-border bg-card flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground mr-1">Karosstyp:</span>
                {BODY_TYPE_OPTIONS.map((opt) => {
                  const active = bodyFilter.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setBodyFilter((prev) =>
                          prev.includes(opt.value)
                            ? prev.filter((v) => v !== opt.value)
                            : [...prev, opt.value],
                        )
                      }
                      className={`text-xs px-2 py-0.5 rounded-full border transition ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-elevated border-border text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {bodyFilter.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBodyFilter([])}
                    className="text-xs px-2 py-0.5 rounded-full border border-dashed text-muted-foreground hover:text-foreground"
                  >
                    Rensa
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tasks idag — bara på översikten */}
          {!stageGroup && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm">Mina uppgifter idag</CardTitle>
                <Link to="/kalender" className="text-xs text-muted-foreground hover:underline">
                  Visa kalender →
                </Link>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {tasksQ.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
                {!tasksQ.isLoading && (tasksQ.data?.tasks.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">Inga tasks idag. 🎉</p>
                )}
                {tasksQ.data?.tasks.map((t: any) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onComplete={async () => {
                      await completeFn({ data: { taskId: t.id } });
                      invalidateTasks();
                    }}
                    onSnooze={async (iso) => {
                      await snoozeFn({ data: { taskId: t.id, snoozed_until: iso } });
                      invalidateTasks();
                    }}
                    onOpenLead={() =>
                      navigate({ to: "/leads/$leadId", params: { leadId: t.lead_id } })
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Lead-lista — operativa kort */}
          <Card className="overflow-hidden">
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">
                {stageGroup ? `${groupMeta?.label}` : "Senaste leads"}
              </CardTitle>
              <button
                type="button"
                onClick={() =>
                  setColumnSort((prev) => ({
                    ...prev,
                    [sortKey]: prev[sortKey] === "desc" ? "asc" : "desc",
                  }))
                }
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition"
                title={sortDir === "asc" ? "Äldst först" : "Nyast först"}
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortDir === "asc" ? "Äldst" : "Nyast"}
              </button>
            </CardHeader>
            <CardContent className="p-0">
              {leadsQ.isLoading && (
                <p className="text-sm text-muted-foreground p-6 text-center">Laddar…</p>
              )}
              {!leadsQ.isLoading && sortedLeads.length === 0 && (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {stageGroup ? "Inga leads i detta steg." : "Inga leads än."}
                  </p>
                  {stageGroup && (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/" search={{ stageGroup: undefined }}>
                        Tillbaka till översikt
                      </Link>
                    </Button>
                  )}
                </div>
              )}
              {sortedLeads.map((l: any) => (
                <LeadCard
                  key={l.id}
                  lead={l}
                  unread={unreadQ.data?.[l.id] ?? 0}
                  carInfoPattern={settingsQ.data?.settings?.car_info_url_pattern}
                  blocketPattern={settingsQ.data?.settings?.blocket_url_pattern}
                  biluppgifterPattern={settingsQ.data?.settings?.biluppgifter_url_pattern}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Höger: SMS Inbox */}
        <aside className="lg:col-span-1">
          <InboxPanel />
        </aside>
      </div>
    </div>
  );
}
