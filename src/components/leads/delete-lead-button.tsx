// Knapp för att radera ett lead permanent. Endast admin eller ägare.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteLead } from "@/lib/leads.functions";

interface Props {
  leadId: string;
  regnr: string;
}

export function DeleteLeadButton({ leadId, regnr }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const del = useServerFn(deleteLead);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await del({ data: { leadId } });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead raderat");
      setOpen(false);
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte radera lead");
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive h-7 px-2"
          title="Radera lead"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Radera lead {regnr}?</AlertDialogTitle>
          <AlertDialogDescription>
            Detta tar bort leadet permanent inklusive fordon, prissättning, SMS,
            anteckningar och bedömning. Åtgärden kan inte ångras.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Radera
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
