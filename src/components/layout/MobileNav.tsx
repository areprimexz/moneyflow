import { NavLink } from "react-router";
import { Dialog as RDialog } from "radix-ui";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { LogoMark, Wordmark } from "./Logo";
import { NavList } from "./Sidebar";

const PRIMARY = ["/", "/markets", "/trade", "/portfolio", "/wallet"];

/** Bottom tab bar for phones. */
export function BottomNav() {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-5">
        {NAV.filter((n) => PRIMARY.includes(n.to)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => cn("flex h-14 flex-col items-center justify-center gap-1 text-[10.5px] font-medium", isActive ? "text-accent" : "text-muted")}
          >
            <item.icon className="h-[18px] w-[18px]" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Slide-in drawer with the full navigation (mobile / tablet). */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Trigger asChild>
        <button className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg lg:hidden" aria-label="Open navigation menu">
          <Menu className="h-5 w-5" />
        </button>
      </RDialog.Trigger>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-overlay lg:hidden" />
        <RDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] animate-slide-in-left flex-col border-r border-line bg-sidebar lg:hidden">
          <RDialog.Title className="sr-only">Navigation</RDialog.Title>
          <RDialog.Description className="sr-only">Main navigation menu</RDialog.Description>
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <span className="flex items-center gap-2.5">
              <LogoMark />
              <Wordmark />
            </span>
            <RDialog.Close className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg" aria-label="Close navigation menu">
              <X className="h-4 w-4" />
            </RDialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <p className="border-t border-line px-4 py-3 text-[11px] text-subtle">Paper-trading account · internal USD ledger</p>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
