// Lead-score-badge (Kall/Normal/Varm/Het).
import { Badge } from "@/components/ui/badge";

interface Props {
  score: number | null | undefined;
}

export function LeadScoreBadge({ score }: Props) {
  const s = score ?? 50;
  let label = "Normal";
  let cls = "bg-status-active/15 text-status-active border-status-active/30";
  let emoji = "";
  if (s >= 80) {
    label = "Het";
    cls = "bg-status-urgent/15 text-status-urgent border-status-urgent/30";
    emoji = "🔥 ";
  } else if (s >= 60) {
    label = "Varm";
    cls = "bg-status-followup/15 text-status-followup border-status-followup/30";
  } else if (s < 40) {
    label = "Kall";
    cls = "bg-status-inactive/15 text-status-inactive border-status-inactive/30";
  }
  return (
    <Badge variant="outline" className={`${cls} tabular-nums`}>
      {emoji}
      {label} · {s}
    </Badge>
  );
}
