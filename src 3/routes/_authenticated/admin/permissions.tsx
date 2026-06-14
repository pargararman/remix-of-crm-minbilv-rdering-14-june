// Admin: behörigheter & kontohantering — säljare/admins + handlarportalanvändare.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck, UserX, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listAccountOverview,
  updateStaffRole,
  removeDealerUser,
} from "@/lib/admin-accounts.functions";
import { AccountActions } from "@/components/admin/account-actions";
import { CreateStaffDialog } from "@/components/admin/create-staff-dialog";
import { CreateDealerUserDialog } from "@/components/admin/create-dealer-user-dialog";

export const Route = createFileRoute("/_authenticated/admin/permissions")({
  component: PermissionsPage,
});

// Returnerar den senaste av inloggning och systemaktivitet.
function latestActivity(signIn: string | null, activity: string | null): string | null {
  if (!signIn && !activity) return null;
  if (!signIn) return activity;
  if (!activity) return signIn;
  return signIn > activity ? signIn : activity;
}

function fmtDate(iso: string | null) {
  if (!iso) return "Aldrig";
  return new Date(iso).toLocaleString("sv-SE", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function PermissionsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAccountOverview);
  const roleFn = useServerFn(updateStaffRole);
  const removeFn = useServerFn(removeDealerUser);

  const q = useQuery({ queryKey: ["account-overview"], queryFn: () => listFn({}) });

  const roleMutation = useMutation({
    mutationFn: (args: { userId: string; role: "admin" | "seller" }) => roleFn({ data: args }),
    onSuccess: () => {
      toast.success("Roll uppdaterad");
      qc.invalidateQueries({ queryKey: ["account-overview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte uppdatera roll"),
  });

  const removeMutation = useMutation({
    mutationFn: (args: { userId: string; dealerId?: string }) => removeFn({ data: args }),
    onSuccess: () => {
      toast.success("Konto borttaget");
      qc.invalidateQueries({ queryKey: ["account-overview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte ta bort konto"),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground p-4">Hämtar…</p>;
  if (q.isError || !q.data) return <p className="text-sm text-destructive p-4">Kunde inte hämta kontoöversikten.</p>;
  const d = q.data;

  const dealersWithAccount = d.dealers.filter((x: any) => x.hasAccount).length;
  const invalidateKeys = [["account-overview"]];

  // Handlare som har minst ett konto, sorterade — de med senaste aktivitet först.
  const dealersWithUsers = d.dealers
    .filter((dl: any) => dl.hasAccount)
    .map((dl: any) => ({
      ...dl,
      latestActivity: dl.users.reduce((best: string | null, u: any) => {
        const t = latestActivity(u.lastSignInAt, u.lastActivityAt);
        if (!best || (t && t > best)) return t;
        return best;
      }, null as string | null),
    }))
    .sort((a: any, b: any) => {
      if (!a.latestActivity && !b.latestActivity) return 0;
      if (!a.latestActivity) return 1;
      if (!b.latestActivity) return -1;
      return b.latestActivity.localeCompare(a.latestActivity);
    });

  return (
    <div className="max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Konton & behörigheter</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Säljare/admins har full tillgång till CRM:et. Handlare ser bara handlarportalen —
          anonymiserade bilar, egna bud och vunna affärer. Kunduppgifter är alltid dolda.
        </p>
      </div>

      {/* ── Säljare & admins ─────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-medium">Säljare & admins ({d.staff.length})</h2>
          <CreateStaffDialog />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Namn</TableHead>
              <TableHead>E-post</TableHead>
              <TableHead>Roll</TableHead>
              <TableHead>Senaste aktivitet</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.staff.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  Inga säljare eller admins ännu.
                </TableCell>
              </TableRow>
            )}
            {d.staff.map((s: any) => {
              const latest = latestActivity(s.lastSignInAt, s.lastActivityAt);
              const isLogin = latest === s.lastSignInAt && latest !== s.lastActivityAt;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.name ?? "—"}</div>
                    <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-xs mt-0.5">
                      {s.status === "active" ? "Aktiv" : s.status ?? "Okänd"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.email ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={s.role}
                      onValueChange={(v) => roleMutation.mutate({ userId: s.id, role: v as any })}
                    >
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seller">Säljare</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm">
                    {latest ? (
                      <div>
                        <div>{fmtDate(latest)}</div>
                        <div className="text-xs text-muted-foreground">
                          {isLogin ? "Inloggning" : "Systemhandling"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Aldrig</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <AccountActions userId={s.id} email={s.email} invalidateKeys={invalidateKeys} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* ── Handlarportal-konton — grupperade per handlare ───── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="font-medium">Handlarportal-konton</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dealersWithAccount} av {d.dealers.length} handlare har portalkonto · sorterat efter senaste aktivitet
            </p>
          </div>
          <CreateDealerUserDialog
            dealers={d.dealers.map((x: any) => ({ dealerId: x.dealerId, companyName: x.companyName, city: x.city }))}
          />
        </div>

        {dealersWithUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga handlare har portalkonto ännu.</p>
        ) : (
          <div className="space-y-3">
            {dealersWithUsers.map((dl: any) => (
              <div key={dl.dealerId} className="border rounded-lg overflow-hidden">
                {/* Handlare-header */}
                <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                  <div className="text-sm font-medium">{dl.companyName}</div>
                  <div className="text-xs text-muted-foreground">{dl.city ?? ""}</div>
                </div>
                {/* Användare under denna handlare */}
                {dl.users.map((u: any) => {
                  const latest = latestActivity(u.lastSignInAt, u.lastActivityAt);
                  const isLogin = latest === u.lastSignInAt && latest !== u.lastActivityAt;
                  return (
                    <div
                      key={u.userId}
                      className="flex items-center gap-3 px-3 py-2 border-t text-sm"
                    >
                      <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{u.email ?? u.userId.slice(0, 12)}</div>
                        {latest ? (
                          <div className="text-xs text-muted-foreground">
                            {isLogin ? "Inloggade" : "Aktivitet"} {fmtDate(latest)}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Aldrig inloggad</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <AccountActions userId={u.userId} email={u.email} invalidateKeys={invalidateKeys} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive h-8 w-8 p-0"
                              title="Ta bort konto"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ta bort portalkonto?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {u.email} ({dl.companyName}) förlorar all inloggningsåtkomst.
                                Bud och affärsdata påverkas inte. Audit-loggas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Avbryt</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => removeMutation.mutate({ userId: u.userId, dealerId: dl.dealerId })}
                              >
                                Ta bort
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Handlare utan portalkonto ─────────────────────────── */}
      {d.dealers.some((dl: any) => !dl.hasAccount) && (
        <Card className="p-4">
          <h2 className="font-medium mb-3">
            Handlare utan portalkonto ({d.dealers.filter((dl: any) => !dl.hasAccount).length})
          </h2>
          <div className="divide-y">
            {d.dealers
              .filter((dl: any) => !dl.hasAccount)
              .map((dl: any) => (
                <div key={dl.dealerId} className="flex items-center justify-between py-2 gap-3">
                  <div className="text-sm min-w-0">
                    <span className="font-medium">{dl.companyName}</span>
                    {dl.city && <span className="text-muted-foreground ml-2 text-xs">{dl.city}</span>}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-2">
                      <UserX className="h-3 w-3" /> saknar konto
                    </span>
                  </div>
                  <CreateDealerUserDialog
                    dealers={[]}
                    fixedDealerId={dl.dealerId}
                    triggerLabel="Skapa konto"
                  />
                </div>
              ))}
          </div>
        </Card>
      )}

      {d.dealers.length > 0 && dealersWithAccount === d.dealers.length && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1 px-1">
          <UserCheck className="h-3 w-3 text-emerald-600" />
          Alla handlare har portalkonto.
        </p>
      )}
    </div>
  );
}
