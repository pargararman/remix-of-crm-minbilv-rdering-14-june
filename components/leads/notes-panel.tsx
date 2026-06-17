// Notes panel — separated internal vs dealer-visible.
// Varje formulär har en explicit [Spara]-knapp med status:
// "Osparade ändringar" / "Sparar…" / "Sparat ✓" / "Kunde inte spara".
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Eye, Trash2, Edit2, Save, X, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { listNotes, createNote, updateNote, deleteNote } from "@/lib/notes.functions";
import { formatDateTime } from "@/lib/format";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "saving")
    return <span className="text-xs flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Sparar…</span>;
  if (state === "dirty")
    return <span className="text-xs font-medium text-status-followup">Osparade ändringar</span>;
  if (state === "saved")
    return <span className="text-xs flex items-center gap-1 text-muted-foreground"><Check className="h-3 w-3 text-status-completed" /> Sparat</span>;
  if (state === "error")
    return <span className="text-xs flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> Kunde inte spara</span>;
  return null;
}

export function NotesPanel({ leadId }: { leadId: string }) {
  const listFn = useServerFn(listNotes);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notes", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });
  const notes = q.data?.notes ?? [];
  const internal = notes.filter((n: any) => n.visibility === "internal");
  const dealer = notes.filter((n: any) => n.visibility === "dealer_visible");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes", leadId] });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <NotesSection
        leadId={leadId}
        title="Interna kommentarer"
        icon={<Lock className="h-4 w-4" />}
        visibility="internal"
        notes={internal}
        bg="bg-muted/40"
        onChanged={invalidate}
      />
      <NotesSection
        leadId={leadId}
        title="Handlarkommentarer"
        icon={
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild><Eye className="h-4 w-4 cursor-help" /></TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Skriv om bilens skick, skador, servicehistorik, däck, utrustning, upphämtningsläge.
                Skriv INTE om förhandlingsstrategi, kundens prisförväntan eller interna beslut.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
        visibility="dealer_visible"
        notes={dealer}
        bg="bg-background"
        onChanged={invalidate}
      />
    </div>
  );
}

function NotesSection({
  leadId, title, icon, visibility, notes, bg, onChanged,
}: {
  leadId: string;
  title: string;
  icon: React.ReactNode;
  visibility: "internal" | "dealer_visible";
  notes: any[];
  bg: string;
  onChanged: () => void;
}) {
  const createFn = useServerFn(createNote);
  const updateFn = useServerFn(updateNote);
  const deleteFn = useServerFn(deleteNote);
  const [draft, setDraft] = useState("");
  const [createState, setCreateState] = useState<SaveState>("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editOriginal, setEditOriginal] = useState("");
  const [editState, setEditState] = useState<SaveState>("idle");

  const draftDirty = draft.trim().length > 0;
  const effectiveCreateState: SaveState =
    createState === "saving" || createState === "error" || createState === "saved"
      ? createState
      : draftDirty ? "dirty" : "idle";

  const editDirty = editContent !== editOriginal && editContent.trim().length > 0;
  const effectiveEditState: SaveState =
    editState === "saving" || editState === "error" || editState === "saved"
      ? editState
      : editDirty ? "dirty" : "idle";

  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
        {icon} {title}
      </div>
      <div className="space-y-2 mb-3">
        <Textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (createState === "saved" || createState === "error") setCreateState("idle"); }}
          placeholder={visibility === "internal" ? "Ny intern anteckning…" : "Ny handlarkommentar…"}
          rows={2}
        />
        <div className="flex items-center justify-between gap-2">
          <SaveStatus state={effectiveCreateState} />
          <Button
            size="sm"
            disabled={!draftDirty || createState === "saving"}
            onClick={async () => {
              setCreateState("saving");
              try {
                await createFn({ data: { leadId, visibility, content: draft.trim() } });
                setDraft("");
                setCreateState("saved");
                onChanged();
                setTimeout(() => setCreateState((s) => (s === "saved" ? "idle" : s)), 2000);
              } catch {
                setCreateState("error");
              }
            }}
          >
            {createState === "saving" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Spara
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {notes.length === 0 && <p className="text-xs text-muted-foreground">Inga anteckningar.</p>}
        {notes.map((n) => {
          const edited = n.updated_at && n.updated_at !== n.created_at;
          if (editingId === n.id) {
            return (
              <div key={n.id} className="space-y-1">
                <Textarea
                  value={editContent}
                  onChange={(e) => { setEditContent(e.target.value); if (editState === "saved" || editState === "error") setEditState("idle"); }}
                  rows={2}
                />
                <div className="flex items-center justify-between gap-2">
                  <SaveStatus state={effectiveEditState} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!editDirty || editState === "saving"}
                      onClick={async () => {
                        setEditState("saving");
                        try {
                          await updateFn({ data: { noteId: n.id, content: editContent } });
                          setEditState("saved");
                          onChanged();
                          setTimeout(() => { setEditingId(null); setEditState("idle"); }, 800);
                        } catch {
                          setEditState("error");
                        }
                      }}
                    >
                      {editState === "saving" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Spara
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditState("idle"); }}>
                      <X className="h-3 w-3 mr-1" /> Avbryt
                    </Button>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={n.id} className="text-sm border-l-2 border-border pl-3">
              <div className="text-xs text-muted-foreground mb-1">
                {n.author?.name ?? "Okänd"} · {formatDateTime(n.created_at)}
                {edited && <span className="ml-2">· redigerad</span>}
              </div>
              <div className="whitespace-pre-wrap">{n.content}</div>
              <div className="flex gap-1 mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => { setEditingId(n.id); setEditContent(n.content); setEditOriginal(n.content); setEditState("idle"); }}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-destructive"
                  onClick={async () => {
                    if (!confirm("Radera anteckningen?")) return;
                    await deleteFn({ data: { noteId: n.id } });
                    onChanged();
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
