// Tydlig logo-knapp för externa lookup-länkar (car.info, Blocket, biluppgifter).
import { ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  type: "car_info" | "blocket" | "biluppgifter";
  /** Link target. Optional when `asButton` is set (action button instead of link). */
  href?: string | null;
  disabledReason?: string;
  onClick?: () => void;
  size?: "sm" | "md";
  ariaLabel?: string;
  /** Render as an action <button> (e.g. Blocket-API valuation) instead of a link. */
  asButton?: boolean;
  /** Spinner state for action-button mode. */
  pending?: boolean;
}

const CONFIG = {
  car_info: {
    label: "car.info",
    tooltip: "Öppna bilens tekniska information i car.info",
    bg: "bg-[#0B5FFF] text-white border-[#0B5FFF]/40 hover:bg-[#0B5FFF]/90",
  },
  blocket: {
    label: "Blocket",
    tooltip: "Öppna Blocket-sökning för liknande bilar",
    bg: "bg-[#FFD700] text-black border-[#FFD700]/60 hover:bg-[#FFD700]/90",
  },
  biluppgifter: {
    label: "biluppgifter.se",
    tooltip: "Öppna fordonsinformation i biluppgifter.se",
    bg: "bg-[#1F3A5F] text-white border-[#1F3A5F]/40 hover:bg-[#1F3A5F]/90",
  },
} as const;

export function ExternalLinkLogoButton({ type, href, disabledReason, onClick, size = "sm", ariaLabel, asButton, pending }: Props) {
  const cfg = CONFIG[type];
  const tooltip = asButton && type === "blocket" ? "Hämta Blocket-värdering (API)" : cfg.tooltip;
  const disabled = (asButton ? !!disabledReason : !href || !!disabledReason) || !!pending;
  const title = disabledReason ? disabledReason : tooltip;
  const sizeCls = size === "sm" ? "h-7 px-2 text-xs gap-1" : "h-8 px-2.5 text-sm gap-1.5";

  if (disabled && !pending) {
    return (
      <span aria-disabled="true" title={title}
        className={cn("inline-flex items-center rounded border font-semibold opacity-50 cursor-not-allowed", sizeCls, cfg.bg)}>
        {cfg.label}
      </span>
    );
  }

  if (asButton) {
    return (
      <button type="button" onClick={onClick} title={title} disabled={!!pending}
        aria-label={ariaLabel ?? tooltip}
        className={cn("inline-flex items-center rounded border font-semibold transition-colors disabled:opacity-70", sizeCls, cfg.bg)}>
        {cfg.label}
        <RefreshCw className={cn("h-3 w-3 opacity-80", pending && "animate-spin")} />
      </button>
    );
  }

  return (
    <a href={href!} target="_blank" rel="noopener noreferrer" onClick={onClick} title={title}
      aria-label={ariaLabel ?? tooltip}
      className={cn("inline-flex items-center rounded border font-semibold transition-colors", sizeCls, cfg.bg)}>
      {cfg.label}
      <ExternalLink className="h-3 w-3 opacity-80" />
    </a>
  );
}
