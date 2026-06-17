// Delade route-boundaries: en spinner + ett återhämtningsbart error-kort.
// Används som default i routern och kan även sättas per route.
import { useEffect } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Home, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RoutePending() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laddar…
      </div>
    </div>
  );
}

export function RouteError({ error, reset }: { error: Error; reset?: () => void }) {
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[RouteError]", error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Något gick fel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground break-words">
            {error?.message ?? "Okänt fel"}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                router.invalidate();
                reset?.();
              }}
            >
              <RotateCw className="h-4 w-4 mr-1" /> Försök igen
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/">
                <Home className="h-4 w-4 mr-1" /> Till leadlistan
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
