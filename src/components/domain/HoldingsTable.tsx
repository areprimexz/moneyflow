import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getAsset } from "@shared/assets";
import type { PositionValuation } from "@shared/engine/portfolio";
import { formatPrice } from "@shared/format";
import { usePreferences } from "@/lib/queries";
import { Table, Td, Tr, SortTh, type SortState } from "@/components/ui/table";
import { compareBy } from "@/lib/sort";
import { Money, Pct, Qty, ChangePill } from "@/components/ui/values";
import { Select } from "@/components/ui/form";
import { AssetLabel } from "./AssetIcon";

type Key = "name" | "price" | "value" | "change" | "pnl" | "qty";

export function HoldingsTable({ positions, detailed = false, linkTo = "portfolio" }: { positions: PositionValuation[]; detailed?: boolean; linkTo?: "portfolio" | "markets" }) {
  const [sort, setSort] = useState<SortState<Key>>({ key: "value", dir: "desc" });
  const navigate = useNavigate();
  const prefs = usePreferences();
  const rows = useMemo(() => {
    let r = positions;
    if (prefs.hideSmallBalances) r = r.filter((p) => p.marketValue.gte(1));
    const get: Record<Key, (p: PositionValuation) => number | string> = {
      name: (p) => p.name,
      price: (p) => p.price?.toNumber() ?? 0,
      value: (p) => p.marketValue.toNumber(),
      change: (p) => p.change24h?.toNumber() ?? 0,
      pnl: (p) => p.unrealizedPnl.toNumber(),
      qty: (p) => p.quantity.toNumber(),
    };
    return [...r].sort(compareBy(get[sort.key], sort.dir));
  }, [positions, sort, prefs.hideSmallBalances]);
  const hidden = positions.length - rows.length;
  const open = (symbol: string) => navigate(linkTo === "portfolio" ? `/portfolio/${symbol}` : `/markets/${symbol}-USD`);

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden md:block">
        <Table minWidth={detailed ? 1080 : 760}>
          <thead>
            <tr>
              <SortTh label="Asset" sortKey="name" sort={sort} onSort={setSort} />
              <SortTh label="Quantity" sortKey="qty" sort={sort} onSort={setSort} align="right" />
              {detailed && <th className="border-b border-line px-3 py-2.5 text-right text-[11px] font-medium tracking-wide text-subtle uppercase">Avg entry</th>}
              <SortTh label="Price" sortKey="price" sort={sort} onSort={setSort} align="right" />
              <SortTh label="24h" sortKey="change" sort={sort} onSort={setSort} align="right" />
              {detailed && <th className="border-b border-line px-3 py-2.5 text-right text-[11px] font-medium tracking-wide text-subtle uppercase">Cost basis</th>}
              <SortTh label="Value" sortKey="value" sort={sort} onSort={setSort} align="right" />
              <SortTh label="Unrealized P/L" sortKey="pnl" sort={sort} onSort={setSort} align="right" />
              {detailed && <th className="border-b border-line px-3 py-2.5 text-right text-[11px] font-medium tracking-wide text-subtle uppercase">Realized P/L</th>}
              {detailed && <th className="border-b border-line px-3 py-2.5 pr-[var(--card-p)] text-right text-[11px] font-medium tracking-wide text-subtle uppercase">Allocation</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const meta = getAsset(p.symbol)!;
              return (
                <Tr key={p.symbol} onClick={() => open(p.symbol)} aria-label={`${p.name} position details`}>
                  <Td>
                    <AssetLabel symbol={p.symbol} sub={p.vault.gt(0) ? `${p.symbol} · ${p.vault.div(p.quantity).times(100).toFixed(0)}% in Vault` : p.symbol} />
                  </Td>
                  <Td align="right">
                    <Qty value={p.quantity} decimals={meta.qtyDecimals} className="text-fg" />
                  </Td>
                  {detailed && (
                    <Td align="right" className="num text-muted">
                      {p.averageEntry ? formatPrice(p.averageEntry, meta.priceDecimals) : "—"}
                    </Td>
                  )}
                  <Td align="right" className="num text-fg">
                    {p.price ? formatPrice(p.price, meta.priceDecimals) : "—"}
                  </Td>
                  <Td align="right">
                    <Pct value={p.change24h} />
                  </Td>
                  {detailed && (
                    <Td align="right">
                      <Money value={p.costBasis} className="text-muted" />
                    </Td>
                  )}
                  <Td align="right">
                    <Money value={p.marketValue} className="font-medium text-fg" compactable />
                  </Td>
                  <Td align="right">
                    <div className="flex flex-col items-end">
                      <Money value={p.unrealizedPnl} signed tone />
                      <Pct value={p.unrealizedPct} className="text-[11px]" />
                    </div>
                  </Td>
                  {detailed && (
                    <Td align="right">
                      <Money value={p.realizedPnl} signed tone />
                    </Td>
                  )}
                  {detailed && (
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-elevated">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, p.allocation.times(100).toNumber())}%` }} />
                        </div>
                        <Pct value={p.allocation} tone={false} signed={false} className="w-14 text-muted" />
                      </div>
                    </Td>
                  )}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      {/* Mobile list */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2 px-[var(--card-p)] pb-2">
          <span className="text-xs text-muted">{rows.length} assets</span>
          <Select aria-label="Sort holdings" value={`${sort.key}:${sort.dir}`} onChange={(e) => {
            const [key, dir] = e.target.value.split(":") as [Key, "asc" | "desc"];
            setSort({ key, dir });
          }} className="w-44">
            <option value="value:desc">Value (high → low)</option>
            <option value="pnl:desc">P/L (high → low)</option>
            <option value="change:desc">24h change (high → low)</option>
            <option value="price:desc">Price (high → low)</option>
            <option value="name:asc">Name (A → Z)</option>
          </Select>
        </div>
        <ul className="divide-y divide-line/70">
          {rows.map((p) => {
            const meta = getAsset(p.symbol)!;
            return (
              <li key={p.symbol}>
                <button onClick={() => open(p.symbol)} className="flex w-full items-center justify-between gap-3 px-[var(--card-p)] py-3 text-left hover:bg-hover">
                  <AssetLabel symbol={p.symbol} sub={`${meta.qtyDecimals ? p.quantity.toFixed() : p.quantity.toFixed(0)} ${p.symbol}`} />
                  <div className="text-right">
                    <Money value={p.marketValue} className="block text-[13px] font-medium text-fg" />
                    <span className="mt-0.5 flex items-center justify-end gap-1.5">
                      <Money value={p.unrealizedPnl} signed tone className="text-[11px]" />
                      <ChangePill value={p.change24h} />
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {hidden > 0 && <p className="px-[var(--card-p)] py-2 text-xs text-subtle">{hidden} small balance{hidden === 1 ? "" : "s"} under $1.00 hidden (Settings → Preferences).</p>}
    </>
  );
}
