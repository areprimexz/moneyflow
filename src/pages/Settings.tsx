import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { cn } from "@/lib/cn";
import { AccountSection, MarketModeSection } from "@/components/settings/AccountSection";
import { BalanceSection } from "@/components/settings/BalanceSection";
import { FeesSection, MarketControlsSection } from "@/components/settings/MarketControlsSection";
import { AboutSection, PreferencesSection, ResetSection } from "@/components/settings/PreferencesSection";

const SECTIONS = [
  { id: "account", label: "Portfolio" },
  { id: "balance", label: "Cash & adjustments" },
  { id: "market", label: "Market data" },
  { id: "market-controls", label: "Market controls" },
  { id: "fees", label: "Trading fees" },
  { id: "preferences", label: "Preferences" },
  { id: "reset", label: "Reset" },
  { id: "about", label: "About" },
];

export default function Settings() {
  const location = useLocation();
  const [active, setActive] = useState("account");

  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (!id) return;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(t);
  }, [location.hash]);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => Boolean(e));
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <ul className="flex gap-1 overflow-x-auto pb-1 scrollbar-none lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "true" : undefined}
                className={cn("block rounded-lg px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors", active === s.id ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg")}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-4">
        <AccountSection />
        <BalanceSection />
        <MarketModeSection />
        <MarketControlsSection />
        <FeesSection />
        <PreferencesSection />
        <ResetSection />
        <AboutSection />
      </div>
    </div>
  );
}
