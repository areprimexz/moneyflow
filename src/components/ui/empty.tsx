import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-elevated text-muted">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-[var(--card-p)] flex flex-wrap items-center justify-between gap-3 rounded-lg border border-down/30 bg-down-soft px-3 py-2.5 text-[13px] text-down">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}
