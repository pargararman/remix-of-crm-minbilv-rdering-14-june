// Ägar-kontroll: "Ta ansvar"-knapp eller dropdown för att byta säljare.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { claimLead, reassignLead, listActiveSellers } from "@/lib/leads-detail.functions";

interface Props {
  leadId: string;
  ownerId: string | null;
  ownerName: string | null;
}

export function OwnerControl({ leadId, ownerId, ownerName }: Props) {
  const qc = useQueryClient();
  const claimFn = useServerFn(claimLead);
  const reassignFn = useServerFn(reassignLead);
  const sellersFn = useServerFn(listActiveSellers);
  const [busy, setBusy] = useState(false);

  const sellers = useQuery({
    queryKey: ["active-sellers"],
    queryFn: () => sellersFn(),
    staleTime: 5 * 60_000,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["lead-detail", leadId] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  }

  async function onClaim() {
    setBusy(true);
    try {
      await claimFn({ data: { leadId } });
      toast.success("Du är nu ansvarig för leaden");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte ta ansvar");
    } finally {
      setBusy(false);
    }
  }

  async function onReassign(newOwnerId: string) {
    if (!newOwnerId || newOwnerId === ownerId) return;
    setBusy(true);
    try {
      await reassignFn({ data: { leadId, newOwnerId } });
      toast.success("Ansvarig säljare uppdaterad");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte uppdatera ansvarig");
    } finally {
      setBusy(false);
    }
  }

  if (!ownerId) {
    return (
      <Button size="sm" variant="outline" onClick={onClaim} disabled={busy}>
        <UserPlus className="h-4 w-4 mr-1" /> Ta ansvar för lead
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground hidden sm:inline">Ansvarig:</span>
      <Select value={ownerId} onValueChange={onReassign} disabled={busy}>
        <SelectTrigger className="h-8 w-[180px] text-sm">
          <SelectValue placeholder={ownerName ?? "Välj…"} />
        </SelectTrigger>
        <SelectContent>
          {(sellers.data ?? []).map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name ?? "Namnlös"}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
