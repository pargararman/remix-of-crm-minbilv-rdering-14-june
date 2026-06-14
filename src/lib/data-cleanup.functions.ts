// Server-funktioner för admin data-cleanup-vyn.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCleanupLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("vehicles")
      .select(
        `lead_id, brand, model, year, mileage_mil, fuel, body_type, gearbox, drive_type, fuel_needs_review, body_type_needs_review,
         lead:leads!inner(id, registration_number, customer_name, stage, archived_at, created_at)`,
      )
      .is("lead.archived_at", null)
      .order("created_at", { foreignTable: "leads", ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      lead: Array.isArray(r.lead) ? r.lead[0] : r.lead,
    }));
  });
