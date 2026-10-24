import { NavLink } from "react-router";
import { ChevronsLeft, ChevronsRight, FlaskConical } from "lucide-react";
import { formatUsd } from "@shared/format";
import { NAV } from "@/lib/nav";
import { usePortfolio } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/tooltip";
import { LogoMark, Wordmark } from "./Logo";

export function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const link = (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                isActive ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg",
                collapsed && "justify-center px-0",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-accent" aria-hidden />}
                <item.icon className={cn("h-[17px] w-[17px] shrink-0", isActive ? "text-accent" : "")} aria-hidden />
                {!collapsed && <span>{item.label}</span>}
                {collapsed && <span className="sr-only">{item.label}</span>}
              </>
            )}
          </NavLink>
        );
        return collapsed ? (
          <Tooltip key={item.to} content={item.label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { valuation } = usePortfolio();
  return (
    <aside
      className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200 lg:flex", collapsed ? "w-[68px]" : "w-60")}
      aria-label="Sidebar"
    >
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-line px-4", collapsed && "justify-center px-0")}>
        <LogoMark />
        {!collapsed && <Wordmark />}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {!collapsed && <p className="mb-2 px-2.5 text-[10px] font-medium tracking-[0.14em] text-subtle uppercase">Navigation</p>}
        <NavList collapsed={collapsed} />
      </div>
      <div className="border-t border-line p-3">
        {!collapsed ? (
          <div className="rounded-lg border border-line bg-card px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">Paper account</span>
              <span className="inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn">
                <FlaskConical className="h-3 w-3" aria-hidden />
                Paper
              </span>
            </div>
            <div className="num mt-1 truncate text-[15px] font-medium text-fg">{valuation ? formatUsd(valuation.totalValue) : "—"}</div>
            <div className="mt-0.5 text-[10.5px] text-subtle">Internal ledger · USD</div>
          </div>
        ) : null}
        <button
          onClick={onToggle}
          className={cn("mt-2 flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-xs text-muted transition-colors hover:bg-hover hover:text-fg", collapsed && "justify-center px-0")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
