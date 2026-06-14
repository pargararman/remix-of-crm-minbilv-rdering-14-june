// Listar inkomna intake-submissions för en lead.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  leadId: string;
}

interface Row {
  id: string;
  step: string | null;
  source: string | null;
  payload_preview: unknown;
  created_at: string;
}

export function SubmissionHistoryList({ leadId }: Props) {
  const q = useQuery({
    queryKey: ["intake-submissions", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intake_submissions" as any)
        .select("id, step, source, payload_preview, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  if (q.isLoading) return <div className="mt-2 text-xs text-amber-800">Laddar historik…</div>;
  const rows = q.data ?? [];
  if (rows.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1">
      {rows.map((r) => (
        <SubmissionRow key={r.id} row={r} />
      ))}
    </ul>
  );
}

function SubmissionRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const when = new Date(row.created_at).toLocaleString("sv-SE");
  return (
    <li className="text-xs text-amber-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 hover:underline"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="tabular-nums">{when}</span>
        <span>·</span>
        <span className="font-medium">{row.step ?? "—"}</span>
      </button>
      {open && (
        <pre className="mt-1 ml-4 max-h-48 overflow-auto rounded bg-amber-100/60 p-2 text-[11px] leading-snug">
          {JSON.stringify(row.payload_preview ?? {}, null, 2)}
        </pre>
      )}
    </li>
  );
}
