// Server functions for the signed-in profile (theme preference, availability, etc.).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const themeSchema = z.object({
  theme: z.enum(["dark", "light", "system"]),
});

export const updateThemePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => themeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("profiles")
      .select("theme_preference")
      .eq("id", userId)
      .maybeSingle();

    const oldTheme = existing?.theme_preference ?? null;

    const { error } = await supabase
      .from("profiles")
      .update({ theme_preference: data.theme })
      .eq("id", userId);

    if (error) throw new Error(error.message);

    // Audit log (best-effort; ignore failures so theme change always succeeds)
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "theme_changed",
      object_type: "profile",
      object_id: userId,
      old_value: { theme: oldTheme },
      new_value: { theme: data.theme },
    });

    return { ok: true, theme: data.theme };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

const availabilitySchema = z.object({
  availability: z.enum(["online", "offline", "away", "sick", "not_taking_leads"]),
});

export const updateMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => availabilitySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ availability: data.availability })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
