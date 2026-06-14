// Admin: behörigheter & kontohantering — säljare/admins + handlarportalanvändare.
// Här hanteras roll, lösenordsåterställning, sätt-nytt-lösenord, skapa konto och
// ta bort handlarkonto.
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

  const dealerUsers = d.dealers.flatMap((dl: any) =>
    dl.users.map((u: any) => ({
      userId: u.userId,
      email: u.email,
      lastSignInAt: u.lastSignInAt,
      dealerId: dl.dealerId,
      companyName: dl.companyName,
      city: dl.city ?? "—",
      status: dl.status,
    })),
  );

  const invalidateKeys = [["account-overview"]];

  return (
    <div className="max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Konton & behörigheter</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Säljare/admins har full tillgång till CRM:et. Handlare ser bara handlarportalen —
          anonymiserade bilar, egna bud och vunna affärer. Kunduppgifter är alltid dolda för handlare.
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
              <TableHead>Status</TableHead>
              <TableHead>Senast inloggad</TableHead>
              <TableHead>Roll</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.staff.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  Inga säljare eller admins ännu.
                </TableCell>
              </TableRow>
            )}
            {d.staff.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{s.email ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-xs">
                    {s.status === "active" ? "Aktiv" : s.status ?? "Okänd"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {s.lastSignInAt ? new Date(s.lastSignInAt).toLocaleString("sv-SE") : "Aldrig"}
                </TableCell>
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
                <TableCell className="text-right">
                  <AccountActions userId={s.id} email={s.email} invalidateKeys={invalidateKeys} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* ── Handlarportal-konton ──────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div>
            <h2 className="font-medium">Handlarportal-konton ({dealerUsers.length})</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dealersWithAccount} av {d.dealers.length} handlare har minst ett konto.
            </p>
          </div>
          <CreateDealerUserDialog
            dealers={d.dealers.map((x: any) => ({ dealerId: x.dealerId, companyName: x.companyName }))}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Handlare</TableHead>
              <TableHead>E-post</TableHead>
              <TableHead>Senast inloggad</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dealerUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  Inga handlarportal-konton ännu. Skapa via knappen ovan eller direkt på handlarsidan.
                </TableCell>
              </TableRow>
            )}
            {dealerUsers.map((u: any) => (
              <TableRow key={u.userId}>
                <TableCell>
                  <div className="font-medium text-sm">{u.companyName}</div>
                  <div className="text-xs text-muted-foreground">{u.city}</div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{u.email ?? u.userId.slice(0, 8)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("sv-SE") : "Aldrig"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <AccountActions userId={u.userId} email={u.email} invalidateKeys={invalidateKeys} />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          title="Ta bort portalkonto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Ta bort portalkonto?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {u.email ?? u.userId.slice(0, 8)} ({u.companyName}) förlorar all
                            inloggningsåtkomst. Befintliga bud och affärsdata påverkas inte.
                            Åtgärden audit-loggas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Avbryt</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() =>
                              removeMutation.mutate({ userId: u.userId, dealerId: u.dealerId })
                            }
                          >
                            Ta bort konto
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
                    <span className="text-muted-foreground ml-2">{dl.city ?? "—"}</span>
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
