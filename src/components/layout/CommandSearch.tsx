import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Dialog as RDialog } from "radix-ui";
import { CornerDownLeft, Search } from "lucide-react";
import { ASSETS, pairSlug } from "@shared/assets";
import { formatPrice } from "@shared/format";
import { NAV } from "@/lib/nav";
import { useQuotes } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { AssetIcon } from "@/components/domain/AssetIcon";
import { Pct } from "@/components/ui/values";

interface Item {
  id: string;
  label: string;
  hint: string;
  to: string;
  symbol?: string;
  icon?: React.ReactNode;
}

/** ⌘K / Ctrl+K quick navigation across pages and markets. */
export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { bySymbol } = useQuotes();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const pages: Item[] = NAV.map((n) => ({ id: `page:${n.to}`, label: n.label, hint: n.description, to: n.to, icon: <n.icon className="h-4 w-4" /> }));
    const markets: Item[] = ASSETS.flatMap((a) => [
      { id: `market:${a.symbol}`, label: `${a.name}`, hint: `${a.symbol}/USD · market details`, to: `/markets/${pairSlug(a.symbol)}`, symbol: a.symbol },
      { id: `trade:${a.symbol}`, label: `Trade ${a.symbol}`, hint: `Open the ${a.symbol}/USD terminal`, to: `/trade/${pairSlug(a.symbol)}`, symbol: a.symbol },
    ]);
    const all = [...pages, ...markets];
    if (!term) return [...pages, ...markets.filter((m) => m.id.startsWith("market:"))];
    return all.filter((i) => `${i.label} ${i.hint} ${i.symbol ?? ""}`.toLowerCase().includes(term));
  }, [q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    setQ("");
    navigate(item.to);
  };

  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Trigger asChild>
        <button className="flex h-8 w-full max-w-[280px] items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg" aria-label="Search markets and pages">
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search markets, pages…</span>
          <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>
      </RDialog.Trigger>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-overlay" />
        <RDialog.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 animate-slide-up overflow-hidden rounded-2xl border border-line-strong bg-card shadow-2xl">
          <RDialog.Title className="sr-only">Search</RDialog.Title>
          <RDialog.Description className="sr-only">Search for pages and markets</RDialog.Description>
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="h-4 w-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(items.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(items[active]);
                }
              }}
              placeholder="Search by asset, ticker or page"
              className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={items[active] ? `cmd-${active}` : undefined}
            />
          </div>
          <div ref={listRef} id="command-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
            {items.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-muted">No results for “{q}”.</p>}
            {items.map((item, i) => {
              const quote = item.symbol ? bySymbol.get(item.symbol) : undefined;
              const asset = item.symbol ? ASSETS.find((a) => a.symbol === item.symbol) : undefined;
              return (
                <div
                  key={item.id}
                  id={`cmd-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", i === active && "bg-hover")}
                >
                  {item.symbol ? <AssetIcon symbol={item.symbol} size={24} /> : <span className="flex h-6 w-6 items-center justify-center text-muted">{item.icon}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-fg">{item.label}</div>
                    <div className="truncate text-xs text-muted">{item.hint}</div>
                  </div>
                  {quote && asset && (
                    <div className="text-right">
                      <div className="num text-xs text-fg">{formatPrice(quote.price, asset.priceDecimals)}</div>
                      <Pct value={quote.change24h} className="text-[11px]" />
                    </div>
                  )}
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-subtle" aria-hidden />}
                </div>
              );
            })}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
