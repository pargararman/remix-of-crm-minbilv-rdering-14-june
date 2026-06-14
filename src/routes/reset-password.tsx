import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Återställ lösenord" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    // Supabase puts the token in the URL hash as type=recovery and triggers
    // a PASSWORD_RECOVERY auth event.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryReady(true);
    });
    // Fallback: if hash already contains recovery, mark ready after a tick.
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setRecoveryReady(true);
    }
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Minst 8 tecken.");
    if (pw !== pw2) return toast.error("Lösenorden matchar inte.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Lösenord uppdaterat.");
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Återställ lösenord</CardTitle>
        </CardHeader>
        <CardContent>
          {!recoveryReady ? (
            <p className="text-sm text-muted-foreground">
              Öppna länken från återställnings-mejlet för att fortsätta.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw">Nytt lösenord</Label>
                <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Bekräfta lösenord</Label>
                <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Sparar…" : "Spara nytt lösenord"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
