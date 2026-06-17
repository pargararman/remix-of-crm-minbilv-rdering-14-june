// Popover som visar manuella övergångar och automatiska regler för aktuell stage.
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@tanstack/react-router";
import {
  STAGE_LABELS,
  MANUAL_TRANSITIONS,
  autoRulesForStage,
  type StageKey,
} from "@/lib/stage-docs";

interface Props {
  stage: string;
}

export function StageRulesPopover({ stage }: Props) {
  const key = stage as StageKey;
  const label = STAGE_LABELS[key] ?? stage;
  const manual = MANUAL_TRANSITIONS[key] ?? [];
  const auto = autoRulesForStage(key);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs gap-1"
          aria-label="Visa stegregler"
        >
          <Info className="h-3.5 w-3.5" />
          Regler
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm">
        <div className="space-y-3">
          <div>
            <div className="font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">
              Översikt av vad som händer i detta steg.
            </div>
          </div>

          <div>
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1">
              Manuella övergångar
            </div>
            {manual.length === 0 ? (
              <div className="text-xs text-muted-foreground">Inga manuella val.</div>
            ) : (
              <ul className="text-xs space-y-0.5">
                {manual.map((m) => (
                  <li key={m}>→ {STAGE_LABELS[m]}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="text-xs font-medium uppercase text-muted-foreground mb-1">
              Automatiska regler
            </div>
            {auto.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Inga automatiska regler påverkar detta steg.
              </div>
            ) : (
              <ul className="text-xs space-y-1.5">
                {auto.map((r) => (
                  <li key={r.id}>
                    <div>{r.trigger}</div>
                    <div className="text-muted-foreground">
                      → {STAGE_LABELS[r.movesTo]}
                      {r.sideEffect ? ` · ${r.sideEffect}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            to="/admin/stage-rules"
            className="text-xs text-primary hover:underline block"
          >
            Visa full översikt →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
