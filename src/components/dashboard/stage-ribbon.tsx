// Kompakt, sticky steg-band (chips) som ersätter de stora pipeline-korten.
import { Link } from "@tanstack/react-router";
import { STAGE_GROUPS, STAGE_TONE_CLASS, type StageGroup } from "@/lib/stage-groups";

interface Props {
  counts: Partial<Record<StageGroup, number>> | undefined;
  active: StageGroup | undefined;
}

export function StageRibbon({ counts, active }: Props) {
  return (
    <div className="sticky top-14 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-background/90 backdrop-blur border-b border-border">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {STAGE_GROUPS.map((g) => {
          const n = counts?.[g.key] ?? 0;
          const isActive = active === g.key;
          return (
            <Link
              key={g.key}
              to="/"
              search={(prev: any) => ({ ...prev, stageGroup: isActive ? undefined : g.key, stage: undefined })}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : `${STAGE_TONE_CLASS[g.tone]} hover:opacity-80`
              }`}
            >
              <span>{g.label}</span>
              <span
                className={`tabular-nums px-1 rounded ${
                  isActive ? "bg-primary-foreground/20" : "bg-background/60"
                }`}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
