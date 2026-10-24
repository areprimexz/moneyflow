import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { applyTheme } from "@/lib/theme";
import { usePreferences } from "@/lib/queries";
import { ActivityWatcher } from "./ActivityWatcher";
import { BottomNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const COLLAPSE_KEY = "flux.sidebar.collapsed";

export function AppShell() {
  const prefs = usePreferences();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => applyTheme(prefs.theme, prefs.density), [prefs.theme, prefs.density]);
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 pt-5 pb-24 lg:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <ActivityWatcher />
    </div>
  );
}
