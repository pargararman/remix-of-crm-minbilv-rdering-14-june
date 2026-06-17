// Återanvändbar combobox för bilmärken baserad på Blockets märkeslista.
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
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { BLOCKET_BRANDS_TOP, BLOCKET_BRANDS_ALL } from "@/lib/brands";

interface Props {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  label?: string;
  hideLabel?: boolean;
  id?: string;
  className?: string;
}

export function BrandCombobox({ value, onChange, label = "Märke", hideLabel, id, className }: Props) {
  const [open, setOpen] = useState(false);
  const isCustom = !!value && !BLOCKET_BRANDS_ALL.some((b) => b.toLowerCase() === value.toLowerCase());

  return (
    <div className={cn("space-y-1.5", className)}>
      {!hideLabel && <Label htmlFor={id} className="text-sm">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between text-sm font-normal"
          >
            <span className={cn(!value && "text-muted-foreground")}>
              {value || "Välj märke…"}
              {isCustom && <span className="ml-1 text-xs text-muted-foreground">(eget)</span>}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[260px]" align="start">
          <Command>
            <CommandInput placeholder="Sök märke…" className="h-9" />
            <CommandList className="max-h-72">
              <CommandEmpty>
                <button
                  type="button"
                  className="w-full text-left text-xs text-primary hover:underline"
                  onClick={() => {
                    const input = (document.activeElement as HTMLInputElement)?.value?.trim();
                    if (input) {
                      onChange(input);
                      setOpen(false);
                    }
                  }}
                >
                  Tryck Enter för att använda som eget märke
                </button>
              </CommandEmpty>
              <CommandGroup heading="Vanligast">
                {BLOCKET_BRANDS_TOP.map((b) => (
                  <CommandItem
                    key={b}
                    value={b}
                    onSelect={() => {
                      onChange(b);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value?.toLowerCase() === b.toLowerCase() ? "opacity-100" : "opacity-0")} />
                    {b}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Alla märken">
                {BLOCKET_BRANDS_ALL.filter((b) => !BLOCKET_BRANDS_TOP.includes(b as any)).map((b) => (
                  <CommandItem
                    key={b}
                    value={b}
                    onSelect={() => {
                      onChange(b);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value?.toLowerCase() === b.toLowerCase() ? "opacity-100" : "opacity-0")} />
                    {b}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {isCustom && (
        <Input
          className="h-8 text-xs"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Eget märke"
        />
      )}
    </div>
  );
}
