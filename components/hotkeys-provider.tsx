import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Shortcut {
  keys: string;
  description: string;
  action?: () => void;
}

export function HotkeysProvider() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "g") {
        const next = (ev: KeyboardEvent) => {
          window.removeEventListener("keydown", next);
          if (ev.key === "d") navigate({ to: "/" });
          else if (ev.key === "k") navigate({ to: "/kalender" });
          else if (ev.key === "r") navigate({ to: "/rapporter" });
        };
        window.addEventListener("keydown", next, { once: true });
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  const shortcuts: Shortcut[] = [
    { keys: "?", description: "Visa kortkommandon" },
    { keys: "g d", description: "Gå till Dashboard" },
    { keys: "g k", description: "Gå till Kalender" },
    { keys: "g r", description: "Gå till Rapporter" },
    { keys: "Esc", description: "Stäng dialog" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kortkommandon</DialogTitle>
          <DialogDescription>Snabba sätt att navigera systemet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <span className="text-sm">{s.description}</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
