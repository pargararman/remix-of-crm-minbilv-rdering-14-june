// Admin: skapa nytt handlarportal-konto direkt och koppla till en handlare.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createDealerAccount } from "@/lib/admin-accounts.functions";

export function CreateDealerUserDialog({
  dealers,
  fixedDealerId,
  triggerLabel = "Ny handlaranvändare",
}: {
  dealers: { dealerId: string; companyName: string }[];
  fixedDealerId?: string;
  triggerLabel?: string;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createDealerAccount);
  const [open, setOpen] = useState(false);
  const [dealerId, setDealerId] = useState(fixedDealerId ?? "");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      fn({ data: { dealerId: fixedDealerId ?? dealerId, email, password: pw } }),
    onSuccess: () => {
      toast.success("Handlarkonto skapat");
      qc.invalidateQueries({ queryKey: ["account-overview"] });
      qc.invalidateQueries({ queryKey: ["dealer"] });
      setOpen(false);
      setEmail(""); setPw("");
      if (!fixedDealerId) setDealerId("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte skapa konto"),
  });

  const effectiveDealerId = fixedDealerId ?? dealerId;
  const canSubmit = !!effectiveDealerId && email.includes("@") && pw.length >= 8;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Store className="h-4 w-4 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skapa nytt handlarportal-konto</DialogTitle>
          <DialogDescription>
            Kontot blir aktivt direkt och kan logga in i handlarportalen.
            Meddela startlösenordet själv på ett säkert sätt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!fixedDealerId && (
            <div className="space-y-1.5">
              <Label>Handlare</Label>
              <Select value={dealerId} onValueChange={setDealerId}>
                <SelectTrigger><SelectValue placeholder="Välj handlare…" /></SelectTrigger>
                <SelectContent>
                  {dealers.map((d) => (
                    <SelectItem key={d.dealerId} value={d.dealerId}>
                      {d.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cd-email">E-post</Label>
            <Input id="cd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-pw">Startlösenord (minst 8 tecken)</Label>
            <Input id="cd-pw" type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Skapa konto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
