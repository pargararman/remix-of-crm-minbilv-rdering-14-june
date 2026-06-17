import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // Avoid SSR/client icon mismatch by rendering a stable placeholder until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const Icon = !mounted
    ? Sun
    : theme === "system"
      ? Monitor
      : resolvedTheme === "dark"
        ? Moon
        : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Byt tema">
          <Icon className="h-[1.1rem] w-[1.1rem]" suppressHydrationWarning />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" /> Ljust läge
          {mounted && theme === "light" && (
            <span className="ml-auto text-xs text-muted-foreground">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" /> Mörkt läge
          {mounted && theme === "dark" && (
            <span className="ml-auto text-xs text-muted-foreground">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" /> Följ system
          {mounted && theme === "system" && (
            <span className="ml-auto text-xs text-muted-foreground">✓</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
