// Admin: skapa nytt handlarportal-konto direkt med sökbar handlarväljare.
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store, Loader2, Search, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createDealerAccount } from "@/lib/admin-accounts.functions";
import { cn } from "@/lib/utils";

export function CreateDealerUserDialog({
  dealers,
  fixedDealerId,
  triggerLabel = "Ny handlaranvändare",
}: {
  dealers: { dealerId: string; companyName: string; city?: string | null }[];
  fixedDealerId?: string;
  triggerLabel?: string;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(createDealerAccount);
  const [open, setOpen] = useState(false);
  const [dealerId, setDealerId] = useState(fixedDealerId ?? "");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const filtered = useMemo(() =>
    dealers.filter((d) =>
      d.companyName.toLowerCase().includes(search.toLowerCase()) ||
      (d.city ?? "").toLowerCase().includes(search.toLowerCase())
    ), [dealers, search]);

  const selectedDealer = dealers.find((d) => d.dealerId === (fixedDealerId ?? dealerId));

  const mut = useMutation({
    mutationFn: () =>
      fn({ data: { dealerId: fixedDealerId ?? dealerId, email, password: pw } }),
    onSuccess: () => {
      toast.success("Handlarkonto skapat — kontot är aktivt direkt");
      qc.invalidateQueries({ queryKey: ["account-overview"] });
      qc.invalidateQueries({ queryKey: ["dealer"] });
      setOpen(false);
      setEmail(""); setPw(""); setSearch("");
      if (!fixedDealerId) setDealerId("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte skapa konto"),
  });

  const effectiveDealerId = fixedDealerId ?? dealerId;
  const canSubmit = !!effectiveDealerId && email.includes("@") && pw.length >= 8;

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) { setEmail(""); setPw(""); setSearch(""); if (!fixedDealerId) setDealerId(""); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Store className="h-4 w-4 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skapa nytt handlarportal-konto</DialogTitle>
          <DialogDescription>
            Kontot aktiveras direkt. Meddela startlösenordet till handlaren på ett säkert sätt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dealer picker — sökbar */}
          {!fixedDealerId && (
            <div className="space-y-1.5">
              <Label>Handlare</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedDealer
                      ? <span>{selectedDealer.companyName}{selectedDealer.city ? <span className="text-muted-foreground ml-1">· {selectedDealer.city}</span> : null}</span>
                      : <span className="text-muted-foreground">Sök på företagsnamn eller ort…</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0" align="start">
                  <div className="flex items-center border-b px-3">
                    <Search className="h-4 w-4 shrink-0 opacity-50 mr-2" />
                    <input
                      className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                      placeholder="Sök företagsnamn eller ort…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {filtered.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">Ingen handlare hittades.</p>
                    )}
                    {filtered.map((d) => (
                      <button
                        key={d.dealerId}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
                          dealerId === d.dealerId && "bg-accent",
                        )}
                        onClick={() => {
                          setDealerId(d.dealerId);
                          setSearch("");
                          setPickerOpen(false);
                        }}
                      >
                        <Check className={cn("h-4 w-4 shrink-0", dealerId === d.dealerId ? "opacity-100" : "opacity-0")} />
                        <span className="font-medium">{d.companyName}</span>
                        {d.city && <span className="text-muted-foreground text-xs">· {d.city}</span>}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {fixedDealerId && selectedDealer && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
              {selectedDealer.companyName}
              {selectedDealer.city && <span className="text-muted-foreground ml-1">· {selectedDealer.city}</span>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cd-email">E-postadress</Label>
            <Input
              id="cd-email"
              type="email"
              placeholder="handlare@foretaget.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cd-pw">Startlösenord <span className="text-muted-foreground font-normal">(minst 8 tecken)</span></Label>
            <Input
              id="cd-pw"
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Meddela detta lösenord direkt till handlaren — ändra det sedan under Konton &amp; behörigheter.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Skapa konto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
