// Tydligt [Spara]-block för redigerbara sektioner.
// Visar status (Osparade ändringar / Sparar… / Senast sparad: HH:MM) och en Spara-knapp.
import { Button } from "@/components/ui/button";
import { Save, Check } from "lucide-react";

interface Props {
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: number | null;
  onSave: () => void;
  label?: string;
  className?: string;
}

function formatHHMM(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

export function SaveBar({ isDirty, isSaving, lastSavedAt, onSave, label = "Spara", className }: Props) {
  return (
    <div
      className={
        "flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 " +
        (isDirty ? "border-status-followup/50 " : "border-border ") +
        (className ?? "")
      }
    >
      <div className="text-xs flex items-center gap-1.5">
        {isSaving ? (
          <span className="text-muted-foreground">Sparar…</span>
        ) : isDirty ? (
          <span className="text-status-followup font-medium">Osparade ändringar</span>
        ) : lastSavedAt != null ? (
          <>
            <Check className="h-3.5 w-3.5 text-status-completed" />
            <span className="text-muted-foreground">Senast sparad: {formatHHMM(lastSavedAt)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Inga ändringar</span>
        )}
      </div>
      <Button
        size="sm"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        className="h-7 px-3 text-xs"
        aria-label={label}
      >
        <Save className="h-3.5 w-3.5 mr-1" />
        {isSaving ? "Sparar…" : label}
      </Button>
    </div>
  );
}
