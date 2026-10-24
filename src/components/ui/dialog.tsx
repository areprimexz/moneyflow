import type { ReactNode } from "react";
import { Dialog as RDialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  side,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Render as a right-side sheet instead of a centered dialog. */
  side?: "right";
}) {
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-overlay backdrop-blur-[2px]" />
        <RDialog.Content
          className={cn(
            "fixed z-50 flex flex-col border border-line bg-card shadow-2xl outline-none",
            side === "right"
              ? "inset-y-0 right-0 w-full max-w-lg animate-fade-in rounded-none border-y-0 border-r-0"
              : cn("top-1/2 left-1/2 max-h-[min(92dvh,760px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 animate-slide-up rounded-2xl", width),
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <RDialog.Title className="text-[15px] font-semibold text-fg">{title}</RDialog.Title>
              {description ? <RDialog.Description className="mt-1 text-[13px] text-muted">{description}</RDialog.Description> : <RDialog.Description className="sr-only">Dialog</RDialog.Description>}
            </div>
            <RDialog.Close className="-mr-1 rounded-md p-1 text-muted transition-colors hover:bg-hover hover:text-fg" aria-label="Close">
              <X className="h-4 w-4" />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Label/value line used in confirmation and detail views. */
export function DetailRow({ label, value, strong, mono = true }: { label: ReactNode; value: ReactNode; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[13px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className={cn("min-w-0 text-right break-all text-fg", mono && "num", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
