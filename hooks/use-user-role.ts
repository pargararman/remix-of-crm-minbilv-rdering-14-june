import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "seller" | "dealer" | null;

export function useUserRole(): { role: AppRole; loading: boolean } {
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        if (active) {
          setRole(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.from("profiles").select("role").eq("id", uid).single();
      if (active) {
        setRole(((data as any)?.role ?? "seller") as AppRole);
        setLoading(false);
      }
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { role, loading };
}
