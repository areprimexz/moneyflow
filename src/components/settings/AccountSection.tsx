import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Radio, SlidersHorizontal } from "lucide-react";
import { D } from "@shared/decimal";
import { formatDate, formatUsd } from "@shared/format";
import type { MarketMode } from "@shared/types";
import { parseUsdInput } from "@shared/validation";
import { api } from "@/lib/api";
import { useAccount, useMarketInvalidation, useQuotes, useSettings } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox, DecimalInput, Field, Input, Select } from "@/components/ui/form";
import { ResetDialog, type ResetPreset } from "@/components/domain/ResetDialog";

function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AccountSection() {
  const account = useAccount().data;
  const [balance, setBalance] = useState("");
  const [baseline, setBaseline] = useState("");
  const [state, setState] = useState<"cash" | "demo">("cash");
  const [touched, setTouched] = useState(false);
  const [preset, setPreset] = useState<ResetPreset | null>(null);

  const initial = account?.initialBalance;
  const baselineAt = account?.baselineAt;
  const startingState = account?.startingState;
  useEffect(() => {
    if (initial !== undefined && baselineAt !== undefined && startingState !== undefined) {
      setBalance(D(initial).toFixed(2));
      setBaseline(toDateInput(baselineAt));
      setState(startingState);
    }
  }, [initial, baselineAt, startingState]);

  const parsed = parseUsdInput(balance, { label: "Initial balance", allowZero: true });
  const dirty = account && (balance !== D(account.initialBalance).toFixed(2) || baseline !== toDateInput(account.baselineAt) || state !== account.startingState);

  return (
    <Card id="account" className="scroll-mt-20">
      <CardHeader title="Portfolio configuration" description="Opening balance, baseline date and display currency" icon={<SlidersHorizontal className="h-4 w-4" />} />
      <div className="card-p space-y-5 pt-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Initial account balance (USD)" htmlFor="initial-balance" error={touched && !parsed.ok ? parsed.error : null} hint={parsed.ok ? `Displayed as ${formatUsd(parsed.value)}` : undefined}>
            <DecimalInput id="initial-balance" value={balance} onValueChange={setBalance} onBlur={() => setTouched(true)} prefix="$" invalid={touched && !parsed.ok} />
          </Field>
          <Field label="Portfolio baseline date" htmlFor="baseline-date" hint={account ? `Current: ${formatDate(account.baselineAt)}` : undefined}>
            <Input id="baseline-date" type="date" max={toDateInput(Date.now())} value={baseline} onChange={(e) => setBaseline(e.target.value)} />
          </Field>
          <Field label="Starting state" htmlFor="starting-state">
            <Select id="starting-state" value={state} onChange={(e) => setState(e.target.value as "cash" | "demo")}>
              <option value="cash">Cash only</option>
              <option value="demo">Sample portfolio (with history)</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-elevated/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            The initial balance is the opening deposit of the ledger. Changing it restarts the account so every balance, trade and report stays consistent. To change cash without restarting, use{" "}
            <a href="#balance" className="text-accent hover:underline">
              Cash &amp; ledger adjustments
            </a>
            .
          </p>
          <Button
            variant="primary"
            disabled={!parsed.ok || !dirty}
            onClick={() => {
              setTouched(true);
              if (parsed.ok) setPreset({ initialBalance: parsed.value.toFixed(2), baselineDate: baseline, startingState: state });
            }}
          >
            Apply &amp; restart account
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Display currency" htmlFor="currency" hint="All balances are maintained and displayed in US dollars.">
            <Select id="currency" value="USD" disabled>
              <option value="USD">USD — US Dollar</option>
            </Select>
          </Field>
          <div className="text-xs text-muted">
            <p className="font-medium text-fg">Account</p>
            <p className="mt-1">
              Created {account ? formatDate(account.createdAt) : "—"} · {account?.totals.transactionCount ?? 0} ledger transactions · ledger revision {account?.revision ?? 0}
            </p>
            <p className="mt-1">Local single-user account. No sign-in is required; account data stays server-side so authentication can be added later.</p>
          </div>
        </div>
      </div>
      <ResetDialog open={Boolean(preset)} onOpenChange={(o) => !o && setPreset(null)} preset={preset ?? undefined} />
    </Card>
  );
}

export function MarketModeSection() {
  const settings = useSettings();
  const quotes = useQuotes();
  const invalidate = useMarketInvalidation();
  const [seed, setSeed] = useState(true);
  const market = settings.data?.market;
  const mutation = useMutation({
    mutationFn: (mode: MarketMode) => api.setMarketMode(mode, seed),
    onSuccess: (r) => {
      void invalidate();
      toast.success(r.market.mode === "live" ? "Live prices selected" : "Market data selected", {
        description: r.market.mode === "live" ? "Prices load from the provider. Trading pauses if they are unavailable." : "Prices now come from the built-in market engine.",
      });
    },
    onError: (e: Error) => toast.error("Could not change market mode", { description: e.message }),
  });
  const options: { mode: MarketMode; title: string; body: string; icon: React.ReactNode }[] = [
    {
      mode: "controlled",
      title: "Built-in market data",
      body: "Deterministic local engine. Configure prices, 24h changes, volatility and movement below. Always available.",
      icon: <SlidersHorizontal className="h-4 w-4" />,
    },
    {
      mode: "live",
      title: "Live reference prices",
      body: `Public reference prices from ${market?.live.provider ?? "the provider"}, fetched and cached by the server${market?.live.hasApiKey ? " with a server-side API key" : ""}. Falls back to controlled prices, with trading paused, when unavailable.`,
      icon: <Radio className="h-4 w-4" />,
    },
  ];
  return (
    <Card id="market" className="scroll-mt-20">
      <CardHeader title="Market data mode" description="Where every price in the application comes from" />
      <div className="card-p space-y-3 pt-4">
        <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Market data mode">
          {options.map((o) => {
            const active = market?.mode === o.mode;
            return (
              <button
                key={o.mode}
                role="radio"
                aria-checked={active}
                disabled={mutation.isPending || !market}
                onClick={() => !active && mutation.mutate(o.mode)}
                className={cn("rounded-xl border p-4 text-left transition-colors", active ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong hover:bg-hover")}
              >
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                    {o.icon} {o.title}
                  </span>
                  {active && <Badge tone="accent">Active</Badge>}
                </span>
                <span className="mt-1.5 block text-xs text-muted">{o.body}</span>
              </button>
            );
          })}
        </div>
        {market?.mode === "live" && (
          <div className="space-y-2">
            <p className={cn("text-xs", quotes.data?.status === "ok" ? "text-up" : "text-warn")}>
              Status: {quotes.data?.status === "ok" ? "receiving live reference prices" : (quotes.data?.message ?? "connecting…")}
              {quotes.data?.lastSuccessAt ? ` · last success ${new Date(quotes.data.lastSuccessAt).toLocaleTimeString()}` : ""}
            </p>
            <Checkbox label="When switching back, start built-in prices from the latest live prices" checked={seed} onChange={setSeed} />
          </div>
        )}
      </div>
    </Card>
  );
}
