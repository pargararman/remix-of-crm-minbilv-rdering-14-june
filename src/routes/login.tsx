import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Logga in — Min Bil Värdering" }],
  }),
  // IMPORTANT: NO blocking `await supabase.auth.getSession()` in beforeLoad.
  // getSession() acquires the exclusive GoTrue auth-token lock; when it races
  // the token-cache init for the same lock it deadlocks (lock HELD + PENDING)
  // and the page hangs forever on the router's pending state ("Laddar…").
  // The "already signed in? -> redirect to /" check now happens lock-free in
  // the component via onAuthStateChange (which pushes the persisted session
  // WITHOUT taking that lock).
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock-free "already authenticated" guard. onAuthStateChange fires
  // INITIAL_SESSION from the persisted session right after subscribing; if a
  // session exists we bounce to the app instead of showing the login form.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data: signIn, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !signIn.user) {
      setLoading(false);
      setError("Fel e-post eller lösenord.");
      return;
    }
    // Roll-baserad redirect
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", signIn.user.id)
      .maybeSingle();
    setLoading(false);
    const role = (profile as any)?.role ?? "seller";
    if (role === "dealer") {
      router.navigate({ to: "/" });
    } else {
      router.navigate({ to: "/" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Logga in</CardTitle>
          <CardDescription>Min Bil Värdering — internt CRM</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-post</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Lösenord</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Logga in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
