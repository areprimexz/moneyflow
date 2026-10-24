import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, Info } from "lucide-react";
import { ASSETS, getAsset } from "@shared/assets";
import { D, ZERO, roundUsd } from "@shared/decimal";
import { formatPrice, formatQty, formatUsd, toInputString } from "@shared/format";
import type { WalletAccount } from "@shared/types";
import { parseDecimalInput } from "@shared/validation";
import { api } from "@/lib/api";
import { rememberLocalTransaction } from "@/lib/localWrites";
import { useAccount, useLedgerInvalidation, useQuotes } from "@/lib/queries";
import { accountLabel } from "@/lib/txMeta";
import { Button } from "@/components/ui/button";
import { Dialog, DetailRow } from "@/components/ui/dialog";
import { DecimalInput, Field, Input, Select } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";

export type WalletAction = "deposit" | "withdraw" | "transfer";

const TITLES: Record<WalletAction, string> = { deposit: "Deposit", withdraw: "Withdrawal", transfer: "Internal transfer" };

/**
 * Deposit, withdraw or transfer on the internal paper ledger. Nothing is sent to or
 * received from a blockchain or bank; the dialog says so explicitly.
 */
export function WalletActionDialog({ action, open, onOpenChange, asset: initialAsset }: { action: WalletAction; open: boolean; onOpenChange: (o: boolean) => void; asset?: string }) {
  const account = useAccount().data;
  const { bySymbol } = useQuotes();
  const invalidate = useLedgerInvalidation();
  const [asset, setAsset] = useState(initialAsset ?? "USD");
  const [acct, setAcct] = useState<WalletAccount>("spot");
  const [from, setFrom] = useState<WalletAccount>("spot");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState<"form" | "review">("form");

  useEffect(() => {
    if (!open) return;
    setAsset(initialAsset ?? "USD");
    setAcct("spot");
    setFrom("spot");
    setAmount("");
    setNote("");
    setTouched(false);
    setStep("form");
  }, [open, initialAsset]);

  const meta = asset === "USD" ? null : getAsset(asset)!;
  const decimals = meta ? meta.qtyDecimals : 2;
  const quote = meta ? bySymbol.get(asset) : null;
  const price = meta ? (quote ? D(quote.price) : null) : D(1);
  const to: WalletAccount = from === "spot" ? "vault" : "spot";
  const sourceAccount = action === "transfer" ? from : acct;

  const balance = (() => {
    if (!account) return ZERO;
    if (asset === "USD") return sourceAccount === "spot" ? D(account.cash.availableSpot) : D(account.cash.vault);
    const p = account.positions.find((x) => x.symbol === asset);
    if (!p) return ZERO;
    return sourceAccount === "spot" ? D(p.availableSpot) : D(p.vault);
  })();

  const parsed = parseDecimalInput(amount, { label: "Amount", maxDecimals: decimals });
  const fee = action === "withdraw" && meta ? D(meta.network.withdrawalFee) : ZERO;
  let error: string | null = parsed.ok ? null : parsed.error;
  if (!error && parsed.ok) {
    if (asset === "USD" && parsed.value.gt("1000000000000")) error = "Amount exceeds the maximum of $1,000,000,000,000.";
    if (action !== "deposit" && parsed.value.plus(fee).gt(balance)) error = action === "withdraw" && fee.gt(0) ? `Amount plus the ${fee.toFixed()} ${asset} network fee exceeds your available balance.` : "Amount exceeds your available balance.";
    if (action === "withdraw" && meta && parsed.value.lt(meta.network.minWithdrawal)) error = `Minimum withdrawal is ${meta.network.minWithdrawal} ${asset}.`;
    if (action === "deposit" && meta && !price) error = "A current price is needed to record the cost basis.";
  }
  const value = parsed.ok && price ? roundUsd(parsed.value.times(price)) : null;

  const mutation = useMutation({
    mutationFn: () => {
      const amt = parsed.ok ? parsed.value.toFixed() : amount;
      const n = note.trim() || undefined;
      if (action === "deposit") return api.deposit({ asset, amount: amt, account: acct, note: n });
      if (action === "withdraw") return api.withdraw({ asset, amount: amt, account: acct, note: n });
      return api.transfer({ asset, amount: amt, from, to, note: n });
    },
    onSuccess: (r) => {
      rememberLocalTransaction(r.transaction.id);
      void invalidate();
      onOpenChange(false);
      const what = asset === "USD" ? formatUsd(r.transaction.gross) : `${formatQty(r.transaction.quantity, decimals, { trim: true })} ${asset}`;
      toast.success(`${TITLES[action]} recorded`, { description: `${what} · ${r.transaction.id}` });
    },
    onError: (e: Error) => toast.error(`${TITLES[action]} failed — no changes were made`, { description: e.message }),
  });

  const max = () => {
    const m = action === "deposit" ? null : balance.minus(fee);
    if (m && m.gt(0)) setAmount(toInputString(m, decimals));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}
      title={TITLES[action]}
      footer={
        step === "form" ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setTouched(true);
                if (!error) setStep("review");
              }}
            >
              Review
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep("form")} disabled={mutation.isPending}>
              Back
            </Button>
            <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Confirm {action}
            </Button>
          </>
        )
      }
    >
      {step === "form" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asset" htmlFor="wallet-asset">
              <Select id="wallet-asset" value={asset} onChange={(e) => { setAsset(e.target.value); setAmount(""); }}>
                <option value="USD">USD — US Dollar</option>
                {ASSETS.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol} — {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {action === "transfer" ? (
              <Field label="Direction">
                <div className="flex h-9 items-center gap-2">
                  <span className="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-xs text-fg">{accountLabel(from)}</span>
                  <button type="button" onClick={() => setFrom(to)} className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg" aria-label="Swap direction">
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                  <span className="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-xs text-fg">{accountLabel(to)}</span>
                </div>
              </Field>
            ) : (
              <Field label="Account">
                <Segmented label="Account" value={acct} onChange={setAcct} options={[{ value: "spot", label: "Spot" }, { value: "vault", label: "Vault" }]} stretch />
              </Field>
            )}
          </div>
          <Field
            label="Amount"
            htmlFor="wallet-amount"
            error={touched ? error : null}
            aside={
              action !== "deposit" && (
                <button type="button" onClick={max} className="text-[11px] text-accent hover:underline">
                  Max {asset === "USD" ? formatUsd(balance) : `${formatQty(balance, decimals, { trim: true })} ${asset}`}
                </button>
              )
            }
            hint={value && asset !== "USD" ? `≈ ${formatUsd(value)} at ${formatPrice(price, meta?.priceDecimals ?? 2)}` : undefined}
          >
            <DecimalInput id="wallet-amount" value={amount} onValueChange={setAmount} onBlur={() => setTouched(true)} prefix={asset === "USD" ? "$" : undefined} suffix={asset} placeholder="0.00" invalid={touched && Boolean(error)} />
          </Field>
          <Field label="Note (optional)" htmlFor="wallet-note">
            <Input id="wallet-note" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="Add a memo for the ledger" />
          </Field>
          {meta && (
            <div className="rounded-lg border border-line bg-elevated/50 p-3 text-xs">
              <DetailRow label="Network (reference)" value={`${meta.network.name}${meta.network.standard && meta.network.standard !== "Native" ? ` · ${meta.network.standard}` : ""}`} mono={false} />
              {action === "withdraw" && (
                <>
                  <DetailRow label="Network fee" value={`${meta.network.withdrawalFee} ${asset}${price ? ` (${formatUsd(roundUsd(D(meta.network.withdrawalFee).times(price)))})` : ""}`} />
                  <DetailRow label="Minimum" value={`${meta.network.minWithdrawal} ${asset}`} />
                </>
              )}
              {action === "deposit" && <DetailRow label="Cost basis" value="Market value at deposit" mono={false} />}
            </div>
          )}
          {action === "transfer" && (
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              Transfers move balances between your Spot (trading) and Vault (holding) accounts. Vault balances count toward your portfolio but cannot be traded.
            </p>
          )}
        </div>
      ) : (
        <div>
          <DetailRow label="Operation" value={TITLES[action]} mono={false} />
          <DetailRow label="Asset" value={asset} />
          <DetailRow label={action === "transfer" ? "From → to" : "Account"} value={action === "transfer" ? `${accountLabel(from)} → ${accountLabel(to)}` : accountLabel(acct)} mono={false} />
          <DetailRow label="Amount" value={asset === "USD" ? formatUsd(parsed.ok ? parsed.value : 0) : `${formatQty(parsed.ok ? parsed.value : 0, decimals)} ${asset}`} strong />
          {asset !== "USD" && value && <DetailRow label="Reference value" value={formatUsd(value)} />}
          {action === "withdraw" && fee.gt(0) && <DetailRow label="Network fee" value={`${fee.toFixed()} ${asset}`} />}
          {action === "withdraw" && fee.gt(0) && parsed.ok && <DetailRow label="Total debited" value={`${formatQty(parsed.value.plus(fee), decimals)} ${asset}`} />}
          {note.trim() && <DetailRow label="Note" value={note.trim()} mono={false} />}
          <p className="mt-3 rounded-lg bg-elevated px-3 py-2 text-[11px] text-muted">This entry is posted to the ledger and cannot be edited afterwards.</p>
        </div>
      )}
    </Dialog>
  );
}
