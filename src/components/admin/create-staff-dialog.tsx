// Admin: skapa nytt säljar- eller adminkonto direkt med lösenord.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";
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
import { createStaffAccount } from "@/lib/admin-accounts.functions";

export function CreateStaffDialog() {
  const qc = useQueryClient();
  const fn = useServerFn(createStaffAccount);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"seller" | "admin">("seller");
  const [pw, setPw] = useState("");

  const mut = useMutation({
    mutationFn: () => fn({ data: { name, email, role, password: pw } }),
    onSuccess: () => {
      toast.success("Konto skapat — användaren kan logga in direkt");
      qc.invalidateQueries({ queryKey: ["account-overview"] });
      setOpen(false);
      setName(""); setEmail(""); setRole("seller"); setPw("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte skapa konto"),
  });

  const canSubmit = name.trim() && email.includes("@") && pw.length >= 8;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="h-4 w-4 mr-1" /> Ny säljare/admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skapa nytt säljar- eller adminkonto</DialogTitle>
          <DialogDescription>
            Kontot blir aktivt direkt och kan logga in. Meddela startlösenordet
            själv på ett säkert sätt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cs-name">Namn</Label>
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-email">E-post</Label>
            <Input id="cs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Roll</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seller">Säljare</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-pw">Startlösenord (minst 8 tecken)</Label>
            <Input id="cs-pw" type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
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
