// Återanvändbara åtgärder per användarkonto: skicka återställningslänk
// och sätt nytt lösenord (admin override). Används både på behörighetssidan
// och på handlardetaljsidan.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Mail, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  sendPasswordResetEmail,
  adminSetUserPassword,
} from "@/lib/admin-accounts.functions";

export function AccountActions({
  userId,
  email,
  invalidateKeys = [],
  size = "sm",
}: {
  userId: string;
  email?: string | null;
  invalidateKeys?: string[][];
  size?: "sm" | "default";
}) {
  const qc = useQueryClient();
  const resetFn = useServerFn(sendPasswordResetEmail);
  const setPwFn = useServerFn(adminSetUserPassword);

  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { userId } }),
    onSuccess: (r: any) =>
      toast.success(`Återställningslänk skickad till ${r?.email ?? "användaren"}`),
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte skicka länk"),
  });

  const setPwMut = useMutation({
    mutationFn: () => setPwFn({ data: { userId, password: pw } }),
    onSuccess: () => {
      toast.success("Lösenord uppdaterat");
      setOpen(false);
      setPw("");
      setPw2("");
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte uppdatera lösenord"),
  });

  const canSubmit = pw.length >= 8 && pw === pw2;

  return (
    <>
      <div className="flex items-center gap-1 justify-end">
        <Button
          size={size}
          variant="ghost"
          disabled={resetMut.isPending || !email}
          onClick={() => resetMut.mutate()}
          title={email ? "Skicka återställningslänk" : "Saknar e-post"}
        >
          {resetMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 hidden sm:inline">Återställ</span>
        </Button>
        <Button
          size={size}
          variant="ghost"
          onClick={() => setOpen(true)}
          title="Sätt nytt lösenord"
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span className="ml-1 hidden sm:inline">Sätt lösenord</span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sätt nytt lösenord</DialogTitle>
            <DialogDescription>
              {email ?? userId.slice(0, 8)} — användaren kan logga in direkt med
              det nya lösenordet. Meddela det själv på ett säkert sätt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">Nytt lösenord (minst 8 tecken)</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPw ? "Dölj" : "Visa"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw2">Bekräfta lösenord</Label>
              <Input
                id="new-pw2"
                type={showPw ? "text" : "password"}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
              />
              {pw2 && pw !== pw2 && (
                <p className="text-xs text-destructive">Lösenorden matchar inte.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={() => setPwMut.mutate()}
              disabled={!canSubmit || setPwMut.isPending}
            >
              {setPwMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Spara lösenord
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
