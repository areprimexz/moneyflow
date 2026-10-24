import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { formatUsd } from "@shared/format";
import { parseUsdInput } from "@shared/validation";
import { api } from "@/lib/api";
import { useAccount } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, DecimalInput, Field, Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";

function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ResetPreset {
  initialBalance?: string;
  startingState?: "cash" | "demo";
  baselineDate?: string;
}

/**
 * Account restart workflow. Explains exactly what is cleared and requires the user to
 * type RESET before anything is changed.
 */
export function ResetDialog({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset?: ResetPreset }) {
  const account = useAccount().data;
  const qc = useQueryClient();
  const [balance, setBalance] = useState("0.00");
  const [state, setState] = useState<"cash" | "demo">("cash");
  const [baseline, setBaseline] = useState(toDateInput(Date.now()));
  const [resetPrefs, setResetPrefs] = useState(false);
  const [resetMarket, setResetMarket] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const s = preset?.startingState ?? "cash";
    setBalance(preset?.initialBalance ?? (account ? Number(account.initialBalance).toFixed(2) : "0.00"));
    setState(s);
    setBaseline(preset?.baselineDate ?? toDateInput(s === "demo" ? Date.now() - 120 * 86_400_000 : Date.now()));
    setResetPrefs(false);
    setResetMarket(false);
    setConfirm("");
    setTouched(false);
  }, [open, preset, account]);

  const parsed = parseUsdInput(balance, { label: "Starting balance", allowZero: true });
  const balanceError = !parsed.ok ? parsed.error : state === "demo" && parsed.value.isZero() ? "A sample portfolio needs a starting balance above $0.00." : null;
  const today = toDateInput(Date.now());
  const baselineMs = (() => {
    if (!baseline) return NaN;
    const [y, m, d] = baseline.split("-").map(Number);
    if (baseline === today) return Date.now();
    return new Date(y!, m! - 1, d!, 0, 0, 0).getTime();
  })();
  const baselineError = !Number.isFinite(baselineMs)
    ? "Choose a baseline date."
    : baselineMs > Date.now()
      ? "Baseline date cannot be in the future."
      : state === "demo" && Date.now() - baselineMs < 2 * 86_400_000
        ? "A sample portfolio needs a baseline at least 2 days in the past."
        : null;

  const mutation = useMutation({
    mutationFn: () =>
      api.reset({
        confirm,
        initialBalance: parsed.ok ? parsed.value.toFixed(2) : balance,
        baselineAt: baselineMs,
        startingState: state,
        resetPreferences: resetPrefs,
        resetMarket,
      }),
    onSuccess: async (data) => {
      await qc.invalidateQueries();
      onOpenChange(false);
      toast.success("Account restarted", { description: `Opening balance ${formatUsd(data.account.initialBalance)}${state === "demo" ? " with sample history" : ""}.` });
    },
    onError: (e: Error) => toast.error("Reset failed — nothing was changed", { description: e.message }),
  });

  const valid = parsed.ok && !balanceError && !baselineError && confirm === "RESET";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Restart account"
      description="This replaces the account with a fresh opening balance."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!valid} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Restart account
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-down/25 bg-down-soft px-3 py-2.5 text-[13px]">
          <p className="flex items-center gap-2 font-medium text-down">
            <AlertTriangle className="h-4 w-4" /> The following will be permanently cleared
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-xs text-muted">
            <li>Cash balances in Spot and Vault{account ? ` (currently ${formatUsd(account.cash.total)})` : ""}</li>
            <li>All holdings and cost-basis lots{account ? ` (${account.positions.filter((p) => Number(p.quantity) > 0).length} assets)` : ""}</li>
            <li>Open and historical orders{account ? ` (${account.openOrders} open)` : ""}</li>
            <li>Every transaction and ledger entry{account ? ` (${account.totals.transactionCount} transactions)` : ""}</li>
            <li>Performance history and analytics</li>
            <li>Preferences and market settings only if selected below</li>
          </ul>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starting balance (USD)" htmlFor="reset-balance" error={touched || state === "demo" ? balanceError : null} hint={parsed.ok ? formatUsd(parsed.value) : undefined}>
            <DecimalInput id="reset-balance" value={balance} onValueChange={setBalance} onBlur={() => setTouched(true)} prefix="$" invalid={Boolean((touched || state === "demo") && balanceError)} />
          </Field>
          <Field label="Baseline date" htmlFor="reset-baseline" error={baselineError} hint="Date of the opening deposit.">
            <Input id="reset-baseline" type="date" max={today} value={baseline} onChange={(e) => setBaseline(e.target.value)} invalid={Boolean(baselineError)} />
          </Field>
        </div>
        <Field label="Starting state">
          <Segmented
            label="Starting state"
            value={state}
            onChange={(v) => {
              setState(v);
              setBaseline(toDateInput(v === "demo" ? Date.now() - 120 * 86_400_000 : Date.now()));
            }}
            options={[
              { value: "cash", label: "Cash only" },
              { value: "demo", label: "Sample portfolio" },
            ]}
            stretch
          />
        </Field>
        <p className="-mt-2 text-xs text-muted">
          {state === "demo"
            ? "Seeds deterministic sample trades between the baseline date and today, executed at historical market prices through the normal ledger."
            : "Starts with the opening balance in Spot cash and no holdings."}
        </p>
        <div className="space-y-2.5">
          <Checkbox label="Also reset preferences" description="Theme, density, chart and notification settings." checked={resetPrefs} onChange={setResetPrefs} />
          <Checkbox label="Also reset market data" description="Restore catalogue prices, volatility and movement rate." checked={resetMarket} onChange={setResetMarket} />
        </div>
        <Field label={<>Type <span className="num font-semibold text-fg">RESET</span> to confirm</>} htmlFor="reset-confirm">
          <Input id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="RESET" className="num" />
        </Field>
      </div>
    </Dialog>
  );
}
