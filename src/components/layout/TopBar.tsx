import { useLocation, useNavigate } from "react-router";
import { FlaskConical, Moon, RotateCcw, Settings, Sun, UserRound } from "lucide-react";
import { navForPath } from "@/lib/nav";
import { usePreferences, useUpdatePreferences } from "@/lib/queries";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { CommandSearch } from "./CommandSearch";
import { MarketStatus } from "./MarketStatus";
import { MobileMenu } from "./MobileNav";
import { Notifications } from "./Notifications";
import { LogoMark } from "./Logo";

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const nav = navForPath(location.pathname);
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const nextTheme = prefs.theme === "dark" ? "light" : "dark";
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <MobileMenu />
        <span className="lg:hidden">
          <LogoMark size={24} />
        </span>
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="truncate text-[15px] font-semibold text-fg">{nav.label}</h1>
          <p className="hidden truncate text-[11px] text-muted sm:block">{nav.description}</p>
        </div>
        <div className="hidden flex-1 justify-center px-4 md:flex">
          <CommandSearch />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline-flex">
            <MarketStatus />
          </span>
          <Tooltip content={`Switch to ${nextTheme} theme`} side="bottom">
            <button
              onClick={() => update.mutate({ theme: nextTheme })}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg"
              aria-label={`Switch to ${nextTheme} theme`}
            >
              {prefs.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </Tooltip>
          <Notifications />
          <Menu
            trigger={
              <button className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-elevated text-muted transition-colors hover:border-line-strong hover:text-fg" aria-label="Account menu">
                <UserRound className="h-4 w-4" />
              </button>
            }
          >
            <div className="px-2.5 py-2">
              <p className="text-[13px] font-medium text-fg">Local paper account</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-warn">
                <FlaskConical className="h-3 w-3" /> Paper trading · internal ledger
              </p>
            </div>
            <MenuSeparator />
            <MenuLabel>Account</MenuLabel>
            <MenuItem icon={<Settings className="h-4 w-4" />} onSelect={() => navigate("/settings")}>
              Settings
            </MenuItem>
            <MenuItem icon={<RotateCcw className="h-4 w-4" />} onSelect={() => navigate("/settings#reset")}>
              Reset paper account
            </MenuItem>
          </Menu>
        </div>
      </div>
    </header>
  );
}
