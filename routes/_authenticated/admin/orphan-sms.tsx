import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  listOrphanMessages,
  assignOrphanToLead,
  ignoreOrphan,
  createLeadFromOrphan,
} from "@/lib/orphan-sms.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatPhone, formatRelative } from "@/lib/format";
import { Inbox, UserPlus, EyeOff, Link2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/orphan-sms")({
  component: OrphanInbox,
});

type Orphan = {
  id: string;
  twilio_message_sid: string | null;
  from_phone: string;
  body: string;
  received_at: string;
  assigned_to_lead_id: string | null;
  ignored: boolean;
};

function OrphanInbox() {
  const [tab, setTab] = useState<"active" | "ignored">("active");
  const [assignTarget, setAssignTarget] = useState<Orphan | null>(null);
  const [createTarget, setCreateTarget] = useState<Orphan | null>(null);

  const list = useServerFn(listOrphanMessages);
  const ignoreFn = useServerFn(ignoreOrphan);

  const query = useQuery({
    queryKey: ["orphan-sms", tab],
    queryFn: () => list({ data: { includeIgnored: tab === "ignored" } }),
  });

  const ignoreMutation = useMutation({
    mutationFn: (orphanId: string) => ignoreFn({ data: { orphanId } }),
    onSuccess: () => {
      toast.success("SMS ignorerat");
      query.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (query.data?.orphans ?? []) as Orphan[];
  const visible = tab === "active" ? rows.filter((r) => !r.ignored && !r.assigned_to_lead_id) : rows.filter((r) => r.ignored);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Inbox className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SMS från okända nummer</h1>
          <p className="text-sm text-muted-foreground">
            Tilldela till en befintlig lead eller skapa en ny.
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "ignored")}>
        <TabsList>
          <TabsTrigger value="active">Aktiva</TabsTrigger>
          <TabsTrigger value="ignored">Ignorerade</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {query.isLoading && <div className="p-6 text-sm text-muted-foreground">Läser in…</div>}
        {!query.isLoading && visible.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">Inga SMS att visa.</div>
        )}
        {visible.map((o) => (
          <div key={o.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{formatPhone(o.from_phone)}</span>
                <span className="text-muted-foreground">· {formatRelative(o.received_at)}</span>
              </div>
              <p className="text-sm mt-1 line-clamp-2 text-foreground/90">{o.body}</p>
            </div>
            {tab === "active" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAssignTarget(o)}>
                  <Link2 className="mr-1 h-4 w-4" /> Tilldela lead
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCreateTarget(o)}>
                  <UserPlus className="mr-1 h-4 w-4" /> Skapa ny lead
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => ignoreMutation.mutate(o.id)}
                  disabled={ignoreMutation.isPending}
                >
                  <EyeOff className="mr-1 h-4 w-4" /> Ignorera
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {assignTarget && (
        <AssignDialog
          orphan={assignTarget}
          onClose={() => setAssignTarget(null)}
          onDone={() => {
            setAssignTarget(null);
            query.refetch();
          }}
        />
      )}
      {createTarget && (
        <CreateLeadDialog
          orphan={createTarget}
          onClose={() => setCreateTarget(null)}
          onDone={() => {
            setCreateTarget(null);
            query.refetch();
          }}
        />
      )}
    </div>
  );
}

function AssignDialog({ orphan, onClose, onDone }: { orphan: Orphan; onClose: () => void; onDone: () => void }) {
  const [leadId, setLeadId] = useState("");
  const assign = useServerFn(assignOrphanToLead);
  const mut = useMutation({
    mutationFn: () => assign({ data: { orphanId: orphan.id, leadId } }),
    onSuccess: () => {
      toast.success("Tilldelat");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tilldela till lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="font-medium">{formatPhone(orphan.from_phone)}</div>
            <div className="text-muted-foreground mt-1">{orphan.body}</div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-id">Lead-ID (UUID)</Label>
            <Input
              id="lead-id"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
            <p className="text-xs text-muted-foreground">
              {/* TODO PHASE_2_2: byt mot global lead-search */}
              Klistra in lead-ID. Global sök kommer i nästa fas.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!leadId || mut.isPending}>
            Tilldela
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateLeadDialog({ orphan, onClose, onDone }: { orphan: Orphan; onClose: () => void; onDone: () => void }) {
  const [regnr, setRegnr] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const router = useRouter();
  const create = useServerFn(createLeadFromOrphan);
  const mut = useMutation({
    mutationFn: () =>
      create({ data: { orphanId: orphan.id, regnr, email, customerName: name || undefined } }),
    onSuccess: (r) => {
      toast.success("Lead skapad");
      onDone();
      router.navigate({ to: "/" });
      void r;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skapa ny lead från SMS</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="font-medium">{formatPhone(orphan.from_phone)}</div>
            <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{orphan.body}</div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="regnr">Registreringsnummer</Label>
            <Input id="regnr" value={regnr} onChange={(e) => setRegnr(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Kundens namn (valfritt)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!regnr || !email || mut.isPending}>
            Skapa lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
