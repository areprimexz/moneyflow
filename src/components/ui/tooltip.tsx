import type { ReactNode } from "react";
import { Tooltip as RTooltip } from "radix-ui";
import { Info } from "lucide-react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/cn";

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-w-[280px] animate-fade-in rounded-lg border border-line-strong bg-raised px-3 py-2 text-xs leading-relaxed text-fg shadow-xl"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

/** A financial term with an accessible definition tooltip. */
export function Term({ k, children, className, icon = false }: { k: GlossaryKey; children?: ReactNode; className?: string; icon?: boolean }) {
  const entry = GLOSSARY[k];
  return (
    <Tooltip
      content={
        <span>
          <span className="mb-0.5 block font-medium">{entry.term}</span>
          <span className="text-muted">{entry.definition}</span>
        </span>
      }
    >
      <button type="button" className={cn("inline-flex cursor-help items-center gap-1 border-b border-dotted border-subtle/70 text-left leading-tight", className)}>
        {children ?? entry.term}
        {icon && <Info className="h-3 w-3 text-subtle" aria-hidden />}
      </button>
    </Tooltip>
  );
}
