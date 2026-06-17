// Modell-combobox bunden till valt märke. Faller tillbaka på fritt textfält
// om märket är okänt eller saknar modell-lista.
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { modelsFor } from "@/lib/car-models";

interface Props {
  brand: string | null | undefined;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  label?: string;
  hideLabel?: boolean;
  id?: string;
  className?: string;
}

export function ModelCombobox({ brand, value, onChange, label = "Modell", hideLabel, id, className }: Props) {
  const [open, setOpen] = useState(false);
  const models = modelsFor(brand);
  const hasList = models.length > 0;
  const isCustom = !!value && hasList && !models.some((m) => m.toLowerCase() === value.toLowerCase());

  // Inget märke valt → disabled placeholder
  if (!brand) {
    return (
      <div className={cn("space-y-1", className)}>
        {!hideLabel && <Label htmlFor={id} className="text-xs">{label}</Label>}
        <Input
          id={id}
          className="h-9 text-sm"
          placeholder="Välj märke först"
          disabled
          value=""
        />
      </div>
    );
  }

  // Okänt märke → fritt textfält
  if (!hasList) {
    return (
      <div className={cn("space-y-1", className)}>
        {!hideLabel && <Label htmlFor={id} className="text-xs">{label}</Label>}
        <Input
          id={id}
          className="h-9 text-sm"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {!hideLabel && <Label htmlFor={id} className="text-xs">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 w-full justify-between text-sm font-normal"
          >
            <span className={cn(!value && "text-muted-foreground")}>
              {value || "Välj modell…"}
              {isCustom && <span className="ml-1 text-xs text-muted-foreground">(eget)</span>}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[260px]" align="start">
          <Command>
            <CommandInput placeholder="Sök modell…" className="h-9" />
            <CommandList className="max-h-72">
              <CommandEmpty>
                <span className="text-xs text-muted-foreground">Ingen träff — skriv eget värde nedan.</span>
              </CommandEmpty>
              <CommandGroup>
                {models.map((m) => (
                  <CommandItem
                    key={m}
                    value={m}
                    onSelect={() => {
                      onChange(m);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value?.toLowerCase() === m.toLowerCase() ? "opacity-100" : "opacity-0")} />
                    {m}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        className="h-8 text-xs"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="Eget värde"
      />
    </div>
  );
}
