import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Percent } from "lucide-react";
import { getAsset } from "@shared/assets";
import { D } from "@shared/decimal";
import { formatPct } from "@shared/format";
import type { CandleInterval, MarketAssetSettingsDTO } from "@shared/types";
import { LIMITS, parseDecimalInput } from "@shared/validation";
import { api } from "@/lib/api";
import { useMarketInvalidation, useSettings } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { DecimalInput, Field, SettingRow, Switch } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { Table, Td, Th } from "@/components/ui/table";
import { AssetLabel } from "@/components/domain/AssetIcon";

const SPEEDS = [
  { value: "0", label: "Paused" },
  { value: "0.5", label: "0.5×" },
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
  { value: "4", label: "4×" },
] as const;
const VOLS = [
  { value: "0.5", label: "Low" },
  { value: "1", label: "Normal" },
  { value: "1.5", label: "High" },
  { value: "2.5", label: "Extreme" },
] as const;
const INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

function AssetRow({ a, disabled }: { a: MarketAssetSettingsDTO; disabled: boolean }) {
  const meta = getAsset(a.symbol)!;
  const invalidate = useMarketInvalidation();
  const [price, setPrice] = useState(a.price);
  const [change, setChange] = useState(D(a.change24h).times(100).toFixed(2));
  const [vol, setVol] = useState((a.baseVolatility * 100).toFixed(2));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) {
      setPrice(a.price);
      setChange(D(a.change24h).times(100).toFixed(2));
      setVol((a.baseVolatility * 100).toFixed(2));
    }
  }, [a.price, a.change24h, a.baseVolatility, editing]);

  const p = parseDecimalInput(price, { label: "Price", min: LIMITS.minAssetPrice, max: LIMITS.maxAssetPrice, maxDecimals: meta.priceDecimals });
  const c = parseDecimalInput(change, { label: "24h change", allowZero: true, allowNegative: true, maxDecimals: 4 });
  const v = parseDecimalInput(vol, { label: "Volatility", allowZero: true, max: D(50), maxDecimals: 2 });
  const changeErr = c.ok && (c.value.lt(-95) || c.value.gt(1000)) ? "24h change must be between -95% and +1000%." : null;
  const error = (!p.ok && p.error) || (!c.ok && c.error) || changeErr || (!v.ok && v.error) || null;
  const priceDirty = editing && (price !== a.price || change !== D(a.change24h).times(100).toFixed(2));
  const volDirty = editing && vol !== (a.baseVolatility * 100).toFixed(2);

  const save = useMutation({
    mutationFn: () => api.updateMarketAsset(a.symbol, { ...(priceDirty ? { price, change24h: change } : {}), ...(volDirty ? { volatility: vol } : {}) }),
    onSuccess: () => {
      setEditing(false);
      void invalidate();
      toast.success(`${a.symbol}/USD updated`, { description: "Prices, charts, valuations and order matching now use the new values." });
    },
    onError: (e: Error) => toast.error(`${a.symbol} not updated`, { description: e.message }),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.updateMarketAsset(a.symbol, { enabled }),
    onSuccess: (_r, enabled) => {
      void invalidate();
      toast.success(`${a.symbol}/USD trading ${enabled ? "enabled" : "halted"}`);
    },
    onError: (e: Error) => toast.error("Could not change market status", { description: e.message }),
  });

  return (
    <tr className="align-top">
      <Td>
        <AssetLabel symbol={a.symbol} size={24} />
      </Td>
      <Td>
        <Switch checked={a.enabled} onCheckedChange={(en) => toggle.mutate(en)} label={`${a.symbol} market enabled`} disabled={toggle.isPending} />
      </Td>
      <Td>
        <DecimalInput aria-label={`${a.symbol} price`} value={price} disabled={disabled} onValueChange={(x) => { setEditing(true); setPrice(x); }} prefix="$" className="w-36" invalid={editing && !p.ok} />
      </Td>
      <Td>
        <DecimalInput aria-label={`${a.symbol} 24h change percent`} value={change} disabled={disabled} allowNegative onValueChange={(x) => { setEditing(true); setChange(x); }} suffix="%" className="w-28" invalid={editing && (!c.ok || Boolean(changeErr))} />
      </Td>
      <Td>
        <DecimalInput aria-label={`${a.symbol} daily volatility percent`} value={vol} disabled={disabled} onValueChange={(x) => { setEditing(true); setVol(x); }} suffix="%/d" className="w-28" invalid={editing && !v.ok} />
      </Td>
      <Td align="right">
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1.5">
            {editing && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Revert
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={!editing || Boolean(error) || (!priceDirty && !volDirty) || disabled} loading={save.isPending} onClick={() => save.mutate()}>
              Apply
            </Button>
          </div>
          {editing && error && <span className="max-w-[220px] text-right text-[11px] whitespace-normal text-down">{error}</span>}
        </div>
      </Td>
    </tr>
  );
}

export function MarketControlsSection() {
  const settings = useSettings();
  const invalidate = useMarketInvalidation();
  const market = settings.data?.market;
  const [resetOpen, setResetOpen] = useState(false);
  const motion = useMutation({
    mutationFn: api.setMarketMotion,
    onSuccess: () => {
      void invalidate();
      toast.success("Market movement updated");
    },
    onError: (e: Error) => toast.error("Could not update market movement", { description: e.message }),
  });
  const intervals = useMutation({
    mutationFn: api.setChartIntervals,
    onSuccess: () => void invalidate(),
    onError: (e: Error) => toast.error("Could not update chart intervals", { description: e.message }),
  });
  const reset = useMutation({
    mutationFn: api.resetMarket,
    onSuccess: () => {
      setResetOpen(false);
      void invalidate();
      toast.success("Controlled market reset to catalogue defaults");
    },
    onError: (e: Error) => toast.error("Market not reset", { description: e.message }),
  });
  const live = market?.mode === "live";

  return (
    <Card id="market-controls" className="scroll-mt-20">
      <CardHeader
        title="Market controls"
        description="Controlled-market behaviour. Every change applies consistently to Markets, Trade, Portfolio, Wallet and Analytics."
        icon={<Activity className="h-4 w-4" />}
        actions={
          <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>
            Reset market
          </Button>
        }
      />
      <div className="card-p pt-2">
        {live && <p className="mb-2 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">Live mode is active. Price, change and volatility edits apply to the controlled market and take effect when you switch back; enabling or halting markets applies immediately.</p>}
        <SettingRow title="Market movement rate" description="How fast synthetic prices move. Paused freezes prices from now on; history is never rewritten.">
          <Segmented label="Market movement rate" value={String(market?.speed ?? 1)} onChange={(v) => motion.mutate({ speed: Number(v) })} options={SPEEDS.map((s) => ({ ...s, disabled: motion.isPending }))} size="xs" />
        </SettingRow>
        <SettingRow title="Synthetic volatility" description="Global multiplier on every asset's daily volatility, applied from now on.">
          <Segmented label="Synthetic volatility" value={String(market?.volatilityMultiplier ?? 1)} onChange={(v) => motion.mutate({ volatilityMultiplier: Number(v) })} options={VOLS.map((s) => ({ ...s, disabled: motion.isPending }))} size="xs" />
        </SettingRow>
        <SettingRow title="Chart intervals" description="Candle intervals offered in the chart toolbar.">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Enabled chart intervals">
            {INTERVALS.map((i) => {
              const on = market?.chartIntervals.includes(i) ?? true;
              return (
                <button
                  key={i}
                  aria-pressed={on}
                  disabled={intervals.isPending || (on && (market?.chartIntervals.length ?? 0) <= 1)}
                  onClick={() => market && intervals.mutate(on ? market.chartIntervals.filter((x) => x !== i) : [...market.chartIntervals, i])}
                  className={cn("h-7 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-50", on ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}
                >
                  {i}
                </button>
              );
            })}
          </div>
        </SettingRow>
      </div>
      <div className="border-t border-line">
        <p className="px-[var(--card-p)] pt-3 text-xs text-muted">
          Per-asset reference values. Setting a price and 24h change reshapes the previous 48 hours of synthetic history so the chart and the quote agree; older history is untouched. Limits: {`$${LIMITS.minAssetPrice.toFixed()}`} – {`$${LIMITS.maxAssetPrice.toFixed()}`}.
        </p>
        <Table minWidth={860} className="mt-2">
          <thead>
            <tr>
              <Th>Market</Th>
              <Th>Enabled</Th>
              <Th>Price (USD)</Th>
              <Th>24h change</Th>
              <Th>Daily volatility</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>{market ? market.assets.map((a) => <AssetRow key={a.symbol} a={a} disabled={false} />) : null}</tbody>
        </Table>
      </div>
      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset controlled market?"
        description="Restores catalogue prices, 24h changes, volatility and movement rate. Your ledger, holdings and orders are not changed."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={reset.isPending} onClick={() => reset.mutate()}>
              Reset market
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">Synthetic price history is regenerated from the defaults, so portfolio history charts will be revalued with the new path. Recorded trade prices never change.</p>
      </Dialog>
    </Card>
  );
}

export function FeesSection() {
  const settings = useSettings();
  const invalidate = useMarketInvalidation();
  const fees = settings.data?.fees;
  const [taker, setTaker] = useState("");
  const [maker, setMaker] = useState("");
  useEffect(() => {
    if (fees) {
      setTaker(D(fees.takerRate).times(100).toFixed());
      setMaker(D(fees.makerRate).times(100).toFixed());
    }
  }, [fees]);
  const t = parseDecimalInput(taker, { label: "Taker fee", allowZero: true, max: D(5), maxDecimals: 4 });
  const m = parseDecimalInput(maker, { label: "Maker fee", allowZero: true, max: D(5), maxDecimals: 4 });
  const dirty = fees && (taker !== D(fees.takerRate).times(100).toFixed() || maker !== D(fees.makerRate).times(100).toFixed());
  const save = useMutation({
    mutationFn: () => api.updateFees({ takerRate: t.ok ? t.value.div(100).toFixed() : "", makerRate: m.ok ? m.value.div(100).toFixed() : "" }),
    onSuccess: (r) => {
      void invalidate();
      toast.success("Fee schedule saved", { description: `Taker ${formatPct(r.fees.takerRate, { signed: false, decimals: 3 })} · maker ${formatPct(r.fees.makerRate, { signed: false, decimals: 3 })}. Applies to new orders.` });
    },
    onError: (e: Error) => toast.error("Fees not saved", { description: e.message }),
  });
  return (
    <Card id="fees" className="scroll-mt-20">
      <CardHeader title="Trading fees" description="Charged in USD on every paper trade" icon={<Percent className="h-4 w-4" />} />
      <div className="card-p grid gap-4 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <Field label="Taker fee (market orders)" htmlFor="taker-fee" error={!t.ok ? t.error : null}>
          <DecimalInput id="taker-fee" value={taker} onValueChange={setTaker} suffix="%" invalid={!t.ok} />
        </Field>
        <Field label="Maker fee (resting limit fills)" htmlFor="maker-fee" error={!m.ok ? m.error : null}>
          <DecimalInput id="maker-fee" value={maker} onValueChange={setMaker} suffix="%" invalid={!m.ok} />
        </Field>
        <Button className="sm:mt-[22px]" variant="secondary" disabled={!dirty || !t.ok || !m.ok} loading={save.isPending} onClick={() => save.mutate()}>
          Save fees
        </Button>
      </div>
      <p className="px-[var(--card-p)] pb-[var(--card-p)] text-xs text-subtle">Open limit orders keep the fee rate they were placed with. Fee = gross × rate, rounded half-up to the cent.</p>
    </Card>
  );
}
