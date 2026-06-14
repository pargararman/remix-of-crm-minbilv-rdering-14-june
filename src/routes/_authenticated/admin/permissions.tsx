// Admin: behörigheter & kontohantering — säljare/admins + handlarportalanvändare.
// Här hanteras roll, lösenordsåterställning, sätt-nytt-lösenord och skapa konto.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck, UserX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  listAccountOverview,
  updateStaffRole,
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

  const q = useQuery({ queryKey: ["account-overview"], queryFn: () => listFn({}) });

  const roleMutation = useMutation({
    mutationFn: (args: { userId: string; role: "admin" | "seller" }) => roleFn({ data: args }),
    onSuccess: () => {
      toast.success("Roll uppdaterad");
      qc.invalidateQueries({ queryKey: ["account-overview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte uppdatera roll"),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground p-4">Hämtar…</p>;
  if (q.isError || !q.data) return <p className="text-sm text-destructive p-4">Kunde inte hämta kontoöversikten.</p>;
  const d = q.data;
  const dealersWithAccount = d.dealers.filter((x: any) => x.hasAccount).length;

  // Platta ut handlarportalanvändare till en lista för tabellvisning.
  const dealerUsers = d.dealers.flatMap((dl: any) =>
    dl.users.map((u: any) => ({
      userId: u.userId,
      email: u.email,
      lastSignInAt: u.lastSignInAt,
      dealerId: dl.dealerId,
      companyName: dl.companyName,
      city: dl.city,
      status: dl.status,
    })),
  );

  const invalidateKeys = [["account-overview"]];

  return (
    <div className="max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Behörigheter & konton</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Säljare/admins har åtkomst till CRM:et. Handlare ser endast handlarportalen
          (anonymiserade bilar, egna bud och vunna affärer) — aldrig kunduppgifter.
        </p>
      </div>

      {/* Staff */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
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
            {d.staff.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{s.email ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "default" : "secondary"}>
                    {s.status ?? "okänd"}
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

      {/* Dealer portal users */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-medium">Handlarportal-användare ({dealerUsers.length})</h2>
            <p className="text-sm text-muted-foreground">
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
                  Inga handlarportal-konton ännu.
                </TableCell>
              </TableRow>
            )}
            {dealerUsers.map((u: any) => (
              <TableRow key={u.userId}>
                <TableCell className="font-medium">{u.companyName}</TableCell>
                <TableCell className="text-muted-foreground">{u.email ?? u.userId.slice(0, 8)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("sv-SE") : "Aldrig"}
                </TableCell>
                <TableCell className="text-right">
                  <AccountActions userId={u.userId} email={u.email} invalidateKeys={invalidateKeys} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Dealers utan portalkonto */}
      <Card className="p-4">
        <h2 className="font-medium mb-3">Handlare utan portalkonto</h2>
        <div className="divide-y">
          {d.dealers.filter((dl: any) => !dl.hasAccount).length === 0 && (
            <p className="text-sm text-muted-foreground">Alla handlare har minst ett portalkonto.</p>
          )}
          {d.dealers
            .filter((dl: any) => !dl.hasAccount)
            .map((dl: any) => (
              <div key={dl.dealerId} className="flex items-center justify-between py-2">
                <div className="text-sm">
                  <span className="font-medium">{dl.companyName}</span>{" "}
                  <span className="text-muted-foreground">· {dl.city ?? "—"}</span>{" "}
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
        {d.dealers.some((dl: any) => dl.hasAccount) && (
          <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-1">
            <UserCheck className="h-3 w-3" />
            Handlare med konto visas i tabellen ovan.
          </p>
        )}
      </Card>
    </div>
  );
}
