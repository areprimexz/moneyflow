import { useState } from "react";
import { AlertTriangle, BellRing, FlaskConical, Palette, RotateCcw } from "lucide-react";
import { ASSETS } from "@shared/assets";
import { formatUsd } from "@shared/format";
import { PORTFOLIO_RANGES, type CandleInterval, type PortfolioRange, type Preferences } from "@shared/types";
import { useAccount, usePreferences, useUpdatePreferences } from "@/lib/queries";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select, SettingRow, Switch } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { ResetDialog } from "@/components/domain/ResetDialog";

const INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

export function PreferencesSection() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const set = (patch: Partial<Preferences>) =>
    update.mutate(patch, { onError: (e) => toast.error("Preference not saved", { description: e instanceof Error ? e.message : String(e) }) });
  return (
    <Card id="preferences" className="scroll-mt-20">
      <CardHeader title="Preferences" description="Saved to the server and restored on every device that opens this app" icon={<Palette className="h-4 w-4" />} />
      <div className="card-p pt-1">
        <SettingRow title="Theme" description="Dark is the default trading theme.">
          <Segmented label="Theme" value={prefs.theme} onChange={(theme) => set({ theme })} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} size="xs" />
        </SettingRow>
        <SettingRow title="Table density" description="Row spacing in tables and card padding.">
          <Segmented label="Table density" value={prefs.density} onChange={(density) => set({ density })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} size="xs" />
        </SettingRow>
        <SettingRow title="Compact large values" description="Abbreviate large values in tables ($1.25M). Headline balances always show full precision.">
          <Switch checked={prefs.compactNumbers} onCheckedChange={(v) => set({ compactNumbers: v })} label="Compact large values" />
        </SettingRow>
        <SettingRow title="Hide small balances" description="Hide holdings worth less than $1.00 in tables.">
          <Switch checked={prefs.hideSmallBalances} onCheckedChange={(v) => set({ hideSmallBalances: v })} label="Hide small balances" />
        </SettingRow>
        <SettingRow title="Chart style" description="Default price chart representation.">
          <Segmented label="Chart style" value={prefs.chartType} onChange={(chartType) => set({ chartType })} options={[{ value: "candles", label: "Candles" }, { value: "line", label: "Line" }]} size="xs" />
        </SettingRow>
        <SettingRow title="Show volume" description="Volume histogram under price charts.">
          <Switch checked={prefs.showVolume} onCheckedChange={(v) => set({ showVolume: v })} label="Show volume" />
        </SettingRow>
        <SettingRow title="Default market pair" description="Opened by the Trade navigation item.">
          <Select aria-label="Default market pair" value={prefs.defaultMarket} onChange={(e) => set({ defaultMarket: e.target.value })} className="w-40">
            {ASSETS.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol}/USD
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Default chart interval" description="Initial candle interval on market and trade charts.">
          <Select aria-label="Default chart interval" value={prefs.defaultInterval} onChange={(e) => set({ defaultInterval: e.target.value as CandleInterval })} className="w-28">
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Portfolio chart range" description="Initial interval of portfolio performance charts.">
          <Select aria-label="Portfolio chart range" value={prefs.portfolioRange} onChange={(e) => set({ portfolioRange: e.target.value as PortfolioRange })} className="w-28">
            {PORTFOLIO_RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Performance interval" description="Interval used by the Overview performance figure.">
          <Select aria-label="Performance interval" value={prefs.performanceRange} onChange={(e) => set({ performanceRange: e.target.value as PortfolioRange })} className="w-28">
            {PORTFOLIO_RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </SettingRow>
      </div>
      <div className="border-t border-line card-p pt-1">
        <p className="flex items-center gap-2 pt-3 text-[13px] font-medium text-fg">
          <BellRing className="h-4 w-4 text-muted" /> Notifications
        </p>
        <SettingRow title="Order fill alerts" description="Toast when a resting limit order fills.">
          <Switch checked={prefs.notifyOrderFills} onCheckedChange={(v) => set({ notifyOrderFills: v })} label="Order fill alerts" />
        </SettingRow>
        <SettingRow title="External ledger activity" description="Toast when ledger entries are recorded from another tab or client.">
          <Switch checked={prefs.notifyLedgerChanges} onCheckedChange={(v) => set({ notifyLedgerChanges: v })} label="External ledger activity alerts" />
        </SettingRow>
      </div>
    </Card>
  );
}

export function ResetSection() {
  const account = useAccount().data;
  const [open, setOpen] = useState(false);
  return (
    <Card id="reset" className="scroll-mt-20 border-down/25">
      <CardHeader title="Reset account" description="Start over with a fresh opening balance" icon={<RotateCcw className="h-4 w-4" />} />
      <div className="card-p pt-3">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="text-[13px] text-muted">
            <p>Resetting permanently clears:</p>
            <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
              <li>• Cash balance{account ? ` (${formatUsd(account.cash.total)})` : ""}</li>
              <li>• Holdings and cost-basis lots</li>
              <li>• Open and historical orders</li>
              <li>• All transactions and ledger entries</li>
              <li>• Performance history and analytics</li>
              <li>• Preferences and market settings, only if you choose</li>
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
              <AlertTriangle className="h-3.5 w-3.5" /> Changing the theme or a market price never resets data. Only this workflow does, and it requires typing RESET.
            </p>
          </div>
          <Button variant="danger" onClick={() => setOpen(true)}>
            Reset account…
          </Button>
        </div>
      </div>
      <ResetDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}

export function AboutSection() {
  return (
    <Card id="about" className="scroll-mt-20">
      <CardHeader title="About this paper-trading account" icon={<FlaskConical className="h-4 w-4" />} />
      <div className="card-p grid gap-4 pt-4 md:grid-cols-3">
        {[
          { t: "Internal ledger", b: "Every balance is maintained by FLUX FINANCE’s internal ledger. Totals are derived from ledger entries; there is no separate stored balance to drift out of sync." },
          { t: "No blockchain movement", b: "Paper deposits, withdrawals and transfers only change internal balances. No addresses are generated, nothing is broadcast, and no on-chain confirmation is ever claimed." },
          { t: "Reference prices only", b: "Live market prices, when enabled, are external reference prices. They value the paper ledger but do not make it a real brokerage or exchange account." },
        ].map((x) => (
          <div key={x.t} className="rounded-lg border border-line bg-elevated/40 p-3.5">
            <p className="text-[13px] font-medium text-fg">{x.t}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{x.b}</p>
          </div>
        ))}
      </div>
      <p className="px-[var(--card-p)] pb-[var(--card-p)] text-[11px] text-subtle">
        Accounting: FIFO cost basis with fees capitalised into buys; realized P/L = sale proceeds after fees − FIFO cost removed; unrealized P/L = market value − remaining cost basis. All money and quantities use decimal arithmetic.
      </p>
    </Card>
  );
}
