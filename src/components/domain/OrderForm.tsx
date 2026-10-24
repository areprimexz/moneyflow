import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Info } from "lucide-react";
import { requireAsset } from "@shared/assets";
import { D, Dec, ZERO, roundUsd } from "@shared/decimal";
import { computeFee } from "@shared/engine/fees";
import { checkAffordability, isMarketable, maxBuyQuantity, planTrade, quantityFromValue, validateLimitPrice, type OrderSide, type OrderType } from "@shared/engine/orders";
import { formatPct, formatPrice, formatQty, formatUsd, toInputString } from "@shared/format";
import { parseDecimalInput } from "@shared/validation";
import { api, newClientOrderId } from "@/lib/api";
import { rememberLocalTransaction } from "@/lib/localWrites";
import { useLedgerInvalidation, usePortfolio, useQuotes, useSettings } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Dialog, DetailRow } from "@/components/ui/dialog";
import { DecimalInput, Field } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { Term } from "@/components/ui/tooltip";

export interface PricePrefill {
  price: string;
  nonce: number;
}

export function OrderForm({ symbol, initialSide = "buy", prefill }: { symbol: string; initialSide?: OrderSide; prefill?: PricePrefill | null }) {
  const meta = requireAsset(symbol);
  const { account, valuation } = usePortfolio();
  const quotes = useQuotes();
  const quote = quotes.bySymbol.get(symbol);
  const fees = useSettings().data?.fees;
  const invalidate = useLedgerInvalidation();

  const [side, setSide] = useState<OrderSide>(initialSide);
  const [type, setType] = useState<OrderType>("market");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [limit, setLimit] = useState("");
  const [lastEdited, setLastEdited] = useState<"qty" | "total">("qty");
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientOrderId, setClientOrderId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => setSide(initialSide), [initialSide]);
  useEffect(() => {
    setQty("");
    setTotal("");
    setLimit("");
    setTouched(false);
  }, [symbol]);
  useEffect(() => {
    if (prefill) {
      setType("limit");
      setLimit(prefill.price);
    }
  }, [prefill]);

  const marketPrice = quote ? D(quote.price) : null;
  const limitParsed = type === "limit" ? parseDecimalInput(limit, { label: "Limit price", maxDecimals: meta.priceDecimals }) : null;
  const limitPrice = limitParsed?.ok ? limitParsed.value : null;
  const refPrice = type === "market" ? marketPrice : limitPrice;
  const marketable = type === "limit" && limitPrice && marketPrice ? isMarketable(side, limitPrice, marketPrice) : false;
  const takerRate = D(fees?.takerRate ?? "0.001");
  const makerRate = D(fees?.makerRate ?? "0.0008");
  const feeRate = type === "market" || marketable ? takerRate : makerRate;
  const execPrice = type === "market" || marketable ? marketPrice : limitPrice;

  const availableCash = account ? D(account.cash.availableSpot) : ZERO;
  const position = account?.positions.find((p) => p.symbol === symbol);
  const availableQty = position ? D(position.availableSpot) : ZERO;

  // Keep quantity and total in sync with whichever field was edited last.
  useEffect(() => {
    if (!refPrice || refPrice.lte(0)) return;
    if (lastEdited === "qty") {
      const q = parseDecimalInput(qty, { allowZero: true });
      setTotal(q.ok ? roundUsd(q.value.times(refPrice)).toFixed(2) : "");
    } else {
      const t = parseDecimalInput(total, { allowZero: true });
      setQty(t.ok ? toInputString(quantityFromValue(t.value, refPrice, meta), meta.qtyDecimals) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refPrice?.toString(), type]);

  const qtyParsed = parseDecimalInput(qty, { label: "Quantity", maxDecimals: meta.qtyDecimals });
  const halted = quote ? !quote.enabled : false;
  const liveBlocked = quotes.data?.mode === "live" && quotes.data.status !== "ok";

  const plan = qtyParsed.ok && execPrice ? planTrade({ side, quantity: qtyParsed.value, unitPrice: execPrice, feeRate, asset: meta }) : null;

  // Limit orders reserve funds at the limit price; validate against that worst case.
  const reservePlan = type === "limit" && !marketable && qtyParsed.ok && limitPrice ? planTrade({ side, quantity: qtyParsed.value, unitPrice: limitPrice, feeRate: makerRate, asset: meta }) : null;

  let error: string | null = null;
  if (halted) error = `${symbol}/USD trading is halted in market settings.`;
  else if (liveBlocked) error = quotes.data?.message ?? "Live prices are unavailable.";
  else if (type === "limit" && limit && !limitParsed?.ok) error = limitParsed && !limitParsed.ok ? limitParsed.error : null;
  else if (type === "limit" && limitPrice) {
    const v = validateLimitPrice(limitPrice, meta);
    if (!v.ok) error = v.error;
  }
  if (!error && qty && !qtyParsed.ok) error = qtyParsed.error;
  const activePlan = reservePlan ?? plan;
  if (!error && activePlan && !activePlan.ok) error = activePlan.error;
  if (!error && activePlan?.ok) {
    const afford = checkAffordability(activePlan.value, availableCash, availableQty);
    if (!afford.ok) error = afford.error;
  }

  const setPct = (pct: number) => {
    if (!refPrice || refPrice.lte(0)) return;
    setTouched(true);
    setLastEdited("qty");
    let q: Dec;
    if (side === "buy") {
      const rate = type === "limit" && !marketable ? makerRate : takerRate;
      q = maxBuyQuantity(availableCash.times(pct), refPrice, rate, meta);
    } else {
      q = availableQty.times(pct).toDecimalPlaces(meta.qtyDecimals, Dec.ROUND_DOWN);
    }
    const s = q.gt(0) ? toInputString(q, meta.qtyDecimals) : "";
    setQty(s);
    setTotal(q.gt(0) ? roundUsd(q.times(refPrice)).toFixed(2) : "");
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.placeOrder({ clientOrderId, symbol, side, type, quantity: qtyParsed.ok ? qtyParsed.value.toFixed() : qty, limitPrice: type === "limit" && limitPrice ? limitPrice.toFixed() : null }),
    onSuccess: (res) => {
      rememberLocalTransaction(res.transaction?.id);
      setConfirmOpen(false);
      setQty("");
      setTotal("");
      setTouched(false);
      const t = res.transaction;
      if (res.order.status === "filled" && t) {
        toast.success(`${side === "buy" ? "Bought" : "Sold"} ${formatQty(t.quantity, meta.qtyDecimals, { trim: true })} ${symbol}`, {
          description: `at ${formatPrice(t.unitPrice, meta.priceDecimals)} · ${side === "buy" ? "cost" : "proceeds"} ${formatUsd(t.net)} incl. ${formatUsd(t.fee)} fee · ${t.id}`,
        });
      } else if (res.order.status === "open") {
        toast.success("Limit order placed", { description: `${side === "buy" ? "Buy" : "Sell"} ${formatQty(res.order.quantity, meta.qtyDecimals, { trim: true })} ${symbol} at ${formatPrice(res.order.limitPrice, meta.priceDecimals)} · ${res.order.id}` });
      }
      if (res.duplicate) toast.info("This order was already submitted — it was not executed again.");
      void invalidate();
    },
    onError: (e: Error) => {
      setSubmitError(e.message);
      toast.error("Order not executed", { description: e.message });
    },
  });

  const canReview = !error && Boolean(activePlan?.ok) && !mutation.isPending && Boolean(account);
  const openConfirm = () => {
    setTouched(true);
    if (!canReview) return;
    setSubmitError(null);
    setClientOrderId(newClientOrderId());
    setConfirmOpen(true);
  };

  const p = plan?.ok ? plan.value : null;
  const cashAfter = p ? (side === "buy" ? availableCash.minus(p.net) : availableCash.plus(p.net)) : null;
  const qtyAfter = p ? (side === "buy" ? (position ? D(position.quantity) : ZERO).plus(p.quantity) : (position ? D(position.quantity) : ZERO).minus(p.quantity)) : null;

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-1 p-3 pb-0" role="tablist" aria-label="Order side">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            onClick={() => setSide(s)}
            className={cn(
              "h-9 rounded-lg text-[13px] font-semibold transition-colors",
              side === s ? (s === "buy" ? "bg-up-soft text-up ring-1 ring-up/40" : "bg-down-soft text-down ring-1 ring-down/40") : "text-muted hover:bg-hover hover:text-fg",
            )}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      <form
        className="space-y-3.5 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          openConfirm();
        }}
        noValidate
      >
        <Segmented
          label="Order type"
          value={type}
          onChange={setType}
          options={[
            { value: "market", label: "Market" },
            { value: "limit", label: "Limit" },
          ]}
          stretch
        />
        <p className="-mt-1.5 text-[11px] text-subtle">
          <Term k={type === "market" ? "marketOrder" : "limitOrder"} icon>
            {type === "market" ? "Executes now at the reference price" : "Rests until the market reaches your price"}
          </Term>
        </p>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Available</span>
          <span className="num text-fg">
            {side === "buy" ? formatUsd(availableCash) : `${formatQty(availableQty, meta.qtyDecimals)} ${symbol}`}
          </span>
        </div>

        {type === "limit" && (
          <Field
            label="Limit price"
            htmlFor="limit-price"
            aside={
              marketPrice && (
                <button type="button" className="text-[11px] text-accent hover:underline" onClick={() => setLimit(marketPrice.toFixed(meta.priceDecimals))}>
                  Use last {formatPrice(marketPrice, meta.priceDecimals)}
                </button>
              )
            }
          >
            <DecimalInput id="limit-price" value={limit} onValueChange={setLimit} prefix="$" suffix="USD" placeholder={marketPrice?.toFixed(meta.priceDecimals) ?? "0.00"} />
          </Field>
        )}

        <Field label="Quantity" htmlFor="order-qty">
          <DecimalInput
            id="order-qty"
            value={qty}
            onValueChange={(v) => {
              setQty(v);
              setLastEdited("qty");
              const q = parseDecimalInput(v, { allowZero: true });
              setTotal(q.ok && refPrice ? roundUsd(q.value.times(refPrice)).toFixed(2) : "");
            }}
            onBlur={() => setTouched(true)}
            suffix={symbol}
            placeholder={meta.qtyDecimals ? `0.${"0".repeat(meta.qtyDecimals)}` : "0"}
            invalid={touched && Boolean(error) && Boolean(qty)}
          />
        </Field>
        <Field label="Order value" htmlFor="order-total">
          <DecimalInput
            id="order-total"
            value={total}
            onValueChange={(v) => {
              setTotal(v);
              setLastEdited("total");
              const t = parseDecimalInput(v, { allowZero: true });
              setQty(t.ok && refPrice ? toInputString(quantityFromValue(t.value, refPrice, meta), meta.qtyDecimals) : "");
            }}
            onBlur={() => setTouched(true)}
            prefix="$"
            suffix="USD"
            placeholder="0.00"
          />
        </Field>
        <div className="grid grid-cols-4 gap-1.5">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button key={pct} type="button" onClick={() => setPct(pct)} className="h-7 rounded-md border border-line text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-fg">
              {pct === 1 ? "Max" : `${pct * 100}%`}
            </button>
          ))}
        </div>

        {type === "limit" && marketable && (
          <p className="flex items-start gap-1.5 rounded-lg bg-info-soft px-2.5 py-2 text-[11px] text-info">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />
            This limit is {side === "buy" ? "at or above" : "at or below"} the market price, so it will execute immediately at the current price as a taker.
          </p>
        )}

        <div className="space-y-1.5 rounded-lg border border-line bg-elevated/50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">{type === "market" || marketable ? "Est. price" : "Limit price"}</span>
            <span className="num text-fg">{execPrice ? formatPrice(execPrice, meta.priceDecimals) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Order value</span>
            <span className="num text-fg">{p ? formatUsd(p.gross) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">
              <Term k={type === "market" || marketable ? "takerFee" : "makerFee"}>Fee</Term> ({formatPct(feeRate, { signed: false, decimals: 3 })})
            </span>
            <span className="num text-fg">{p ? formatUsd(p.fee) : formatUsd(computeFee(0, feeRate))}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 font-medium">
            <span className="text-muted">{side === "buy" ? "Total cost" : "Net proceeds"}</span>
            <span className="num text-fg">{p ? formatUsd(p.net) : "—"}</span>
          </div>
        </div>

        {(touched || halted || liveBlocked) && error && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-down">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}

        <Button type="submit" variant={side === "buy" ? "buy" : "sell"} size="lg" className="w-full justify-center" disabled={halted || liveBlocked || !account || mutation.isPending}>
          {side === "buy" ? "Review buy" : "Review sell"} {symbol}
        </Button>
      </form>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => !mutation.isPending && setConfirmOpen(o)}
        title={`Confirm ${type} ${side}`}
        description={`${symbol}/USD · paper trade on the internal ledger`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button variant={side === "buy" ? "buy" : "sell"} loading={mutation.isPending} onClick={() => mutation.mutate()}>
              {type === "market" || marketable ? `Confirm ${side}` : "Place limit order"}
            </Button>
          </>
        }
      >
        {p && (
          <div>
            <DetailRow label="Side" value={<span className={side === "buy" ? "text-up" : "text-down"}>{side.toUpperCase()}</span>} />
            <DetailRow label="Order type" value={type === "market" ? "Market" : marketable ? "Limit (marketable)" : "Limit"} mono={false} />
            <DetailRow label="Quantity" value={`${formatQty(p.quantity, meta.qtyDecimals)} ${symbol}`} />
            <DetailRow label={type === "market" || marketable ? "Estimated price" : "Limit price"} value={formatPrice(p.unitPrice, meta.priceDecimals)} />
            <DetailRow label="Order value" value={formatUsd(p.gross)} />
            <DetailRow label={`Fee (${formatPct(feeRate, { signed: false, decimals: 3 })})`} value={formatUsd(p.fee)} />
            <DetailRow label={side === "buy" ? "Total cost" : "Net proceeds"} value={formatUsd(p.net)} strong />
            {type === "market" || marketable ? (
              <>
                <DetailRow label="Cash after" value={cashAfter ? formatUsd(cashAfter) : "—"} />
                <DetailRow label={`${symbol} after`} value={qtyAfter ? formatQty(qtyAfter, meta.qtyDecimals) : "—"} />
              </>
            ) : (
              <DetailRow label="Reserved until filled" value={side === "buy" ? formatUsd(reservePlan?.ok ? reservePlan.value.net : p.net) : `${formatQty(p.quantity, meta.qtyDecimals)} ${symbol}`} />
            )}
            <p className="mt-3 rounded-lg bg-elevated px-3 py-2 text-[11px] leading-relaxed text-muted">
              {type === "market" || marketable
                ? "Market orders execute at the reference price at the moment the server processes the order, which may differ slightly from this estimate."
                : "The order rests until the reference price reaches your limit, then fills at the limit price with the maker fee. You can cancel it at any time before it fills."}{" "}
              This is a paper trade recorded on the internal ledger; nothing is sent to an exchange or blockchain.
            </p>
            {submitError && (
              <p role="alert" className="mt-3 text-xs text-down">
                {submitError}
              </p>
            )}
            {valuation && <span className="sr-only">Portfolio value {formatUsd(valuation.totalValue)}</span>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
