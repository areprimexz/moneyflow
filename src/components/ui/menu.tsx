import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/cn";

export function Menu({ trigger, children, align = "end", className }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn("z-50 min-w-[200px] animate-fade-in rounded-xl border border-line-strong bg-card p-1 shadow-2xl", className)}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ children, onSelect, icon, danger }: { children: ReactNode; onSelect?: () => void; icon?: ReactNode; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none select-none data-[highlighted]:bg-hover",
        danger ? "text-down" : "text-fg",
      )}
    >
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}
