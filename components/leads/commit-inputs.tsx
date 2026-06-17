// Free-text inputs that hold their value in local state while typing and
// only commit (call onCommit) on blur or when the user presses Enter.
// Escape reverts to the last committed value. This prevents per-keystroke
// Supabase saves and the resulting "Sparar…" flicker.
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface BaseProps {
  label?: string;
  hideLabel?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
}

interface TextProps extends BaseProps {
  value: string | null | undefined;
  onCommit: (v: string | null) => void;
  multiline?: boolean;
  rows?: number;
  type?: "text" | "date" | "email" | "tel";
}

export function CommitTextField({
  label,
  hideLabel,
  className,
  inputClassName,
  placeholder,
  disabled,
  value,
  onCommit,
  multiline,
  rows = 2,
  type = "text",
}: TextProps) {
  const [local, setLocal] = useState<string>(value ?? "");
  const baseline = useRef<string>(value ?? "");

  // Sync from prop when the externally committed value changes (e.g. after save).
  useEffect(() => {
    const v = value ?? "";
    if (v !== baseline.current) {
      baseline.current = v;
      setLocal(v);
    }
  }, [value]);

  const commit = () => {
    if (local === (baseline.current ?? "")) return;
    baseline.current = local;
    onCommit(local === "" ? null : local);
  };

  const revert = () => setLocal(baseline.current);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      revert();
      (e.target as HTMLElement).blur();
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      {label && !hideLabel && <Label className="text-xs">{label}</Label>}
      {multiline ? (
        <Textarea
          className={cn("text-sm", inputClassName)}
          rows={rows}
          value={local}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      ) : (
        <Input
          type={type}
          className={cn("h-9 text-sm", inputClassName)}
          value={local}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
}

interface NumberProps extends BaseProps {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
}

export function CommitNumberField({
  label,
  hideLabel,
  className,
  inputClassName,
  placeholder,
  disabled,
  value,
  onCommit,
}: NumberProps) {
  const [local, setLocal] = useState<string>(value == null ? "" : String(value));
  const baseline = useRef<string>(value == null ? "" : String(value));

  useEffect(() => {
    const v = value == null ? "" : String(value);
    if (v !== baseline.current) {
      baseline.current = v;
      setLocal(v);
    }
  }, [value]);

  const commit = () => {
    if (local === baseline.current) return;
    baseline.current = local;
    onCommit(local === "" ? null : Number(local));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setLocal(baseline.current);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      {label && !hideLabel && <Label className="text-xs">{label}</Label>}
      <Input
        className={cn("h-9 text-sm tabular-nums", inputClassName)}
        inputMode="numeric"
        value={local}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
