// Tags chip-row med add/remove.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listLeadTags, addTag, removeTag } from "@/lib/tags.functions";
import { TAGS, TAG_LABEL, TAG_COLOR } from "@/lib/tags";

export function TagsRow({ leadId }: { leadId: string }) {
  const listFn = useServerFn(listLeadTags);
  const addFn = useServerFn(addTag);
  const removeFn = useServerFn(removeTag);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["lead-tags", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const tags = q.data?.tags ?? [];
  const available = TAGS.filter((t) => !tags.includes(t.value));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lead-tags", leadId] });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => (
        <span
          key={t}
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${TAG_COLOR[t] ?? "bg-muted text-muted-foreground"}`}
        >
          {TAG_LABEL[t] ?? t}
          <button
            onClick={async () => {
              await removeFn({ data: { leadId, tag: t as any } });
              invalidate();
            }}
            className="opacity-70 hover:opacity-100"
            aria-label="Ta bort"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Tagg
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            <div className="space-y-1">
              {available.map((t) => (
                <button
                  key={t.value}
                  className={`w-full text-left px-2 py-1 text-xs rounded ${t.color} hover:opacity-80`}
                  onClick={async () => {
                    await addFn({ data: { leadId, tag: t.value } });
                    invalidate();
                    setOpen(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
