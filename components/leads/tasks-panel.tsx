// Tasks panel for lead detail + reusable list row.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listMyTasks, createTask, completeTask, snoozeTask } from "@/lib/tasks.functions";
import { formatDateTime } from "@/lib/format";

const TEMPLATES = [
  "Ring kund",
  "Skicka värdering",
  "Följ upp",
  "Kontrollera bud",
  "Bekräfta hämtning",
  "Markera affär som vunnen",
];

function snoozeOptions() {
  const now = new Date();
  const in1h = new Date(now.getTime() + 3600_000);
  const in4h = new Date(now.getTime() + 4 * 3600_000);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(8,0,0,0);
  const nextMon = new Date(now);
  const daysUntilMon = (8 - now.getDay()) % 7 || 7;
  nextMon.setDate(nextMon.getDate() + daysUntilMon); nextMon.setHours(8,0,0,0);
  return [
    { label: "1 timme", iso: in1h.toISOString() },
    { label: "4 timmar", iso: in4h.toISOString() },
    { label: "Imorgon 08:00", iso: tomorrow.toISOString() },
    { label: "Nästa måndag 08:00", iso: nextMon.toISOString() },
  ];
}

export function TasksPanel({ leadId }: { leadId: string }) {
  const listFn = useServerFn(listMyTasks);
  const createFn = useServerFn(createTask);
  const completeFn = useServerFn(completeTask);
  const snoozeFn = useServerFn(snoozeTask);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["tasks-lead", leadId],
    queryFn: () => listFn({ data: { scope: "lead", leadId } }),
  });
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks-lead", leadId] });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold">Tasks</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4 mr-1" /> Ny task</Button>
      </div>
      {showForm && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex flex-wrap gap-1">
            {TEMPLATES.map((t) => (
              <button key={t} className="text-xs px-2 py-1 rounded border hover:bg-muted" onClick={() => setTitle(t)}>{t}</button>
            ))}
          </div>
          <div>
            <Label className="text-xs">Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Förfaller</Label>
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!title.trim()} onClick={async () => {
              await createFn({ data: { leadId, title: title.trim(), due_date: due ? new Date(due).toISOString() : null } });
              setTitle(""); setDue(""); setShowForm(false); invalidate();
            }}>Skapa</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Avbryt</Button>
          </div>
        </div>
      )}
      <div className="space-y-1">
        {q.data?.tasks.length === 0 && <p className="text-sm text-muted-foreground">Inga tasks.</p>}
        {q.data?.tasks.map((t: any) => (
          <TaskRow key={t.id} task={t} onComplete={async () => { await completeFn({ data: { taskId: t.id } }); invalidate(); }} onSnooze={async (iso) => { await snoozeFn({ data: { taskId: t.id, snoozed_until: iso } }); invalidate(); }} />
        ))}
      </div>
    </div>
  );
}

export function TaskRow({ task, onComplete, onSnooze, onOpenLead }: {
  task: any;
  onComplete: () => void;
  onSnooze: (iso: string) => void;
  onOpenLead?: () => void;
}) {
  const done = task.status === "completed";
  const overdue = !done && task.due_date && new Date(task.due_date) < new Date();
  return (
    <div className="flex items-start gap-3 p-2 rounded hover:bg-muted/30">
      <button onClick={onComplete} className="mt-1" disabled={done}>
        {done ? <CheckCircle className="h-4 w-4 text-green-500" /> : <div className="h-4 w-4 border rounded" />}
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={onOpenLead} className={`text-sm text-left ${done ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
        </button>
        {task.lead && (
          <div className="text-xs text-muted-foreground">
            {task.lead.customer_name ?? "—"} · {task.lead.registration_number}
          </div>
        )}
        {task.due_date && (
          <div className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
            {overdue ? "Försenat · " : ""}{formatDateTime(task.due_date)}
          </div>
        )}
      </div>
      {!done && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7"><Clock className="h-3 w-3 mr-1" /> Snooze</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {snoozeOptions().map((o) => (
              <DropdownMenuItem key={o.label} onClick={() => onSnooze(o.iso)}>{o.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
