import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { updateThemePreference } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem("theme");
  if (v === "dark" || v === "light" || v === "system") return v;
  return "light";
}

function resolve(t: ThemePreference): ResolvedTheme {
  if (t === "system" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return t === "light" ? "light" : "dark";
}

function apply(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStored());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(readStored()));
  const updateTheme = useServerFn(updateThemePreference);
  const hydrated = useRef(false);

  // Apply on theme change
  useEffect(() => {
    const r = resolve(theme);
    setResolvedTheme(r);
    apply(r);
  }, [theme]);

  // Listen to system changes when in 'system' mode
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolvedTheme(r);
      apply(r);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // On mount, if signed in pull theme_preference from DB (overrides localStorage)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("theme_preference")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const dbTheme = profile?.theme_preference as ThemePreference | undefined;
      if (dbTheme && (dbTheme === "dark" || dbTheme === "light" || dbTheme === "system")) {
        if (dbTheme !== theme) {
          setThemeState(dbTheme);
          window.localStorage.setItem("theme", dbTheme);
        }
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback(
    (t: ThemePreference) => {
      setThemeState(t);
      const r = resolve(t);
      apply(r);
      try {
        window.localStorage.setItem("theme", t);
      } catch {
        /* ignore */
      }
      // Persist to DB if signed in
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          updateTheme({ data: { theme: t } }).catch(() => {
            /* non-blocking */
          });
        }
      });
    },
    [updateTheme],
  );

  // Keyboard shortcut Ctrl/Cmd + Shift + L
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resolvedTheme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
