import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Scale } from "lucide-react";
import { D } from "@shared/decimal";
import { formatShortDateTime, formatUsd } from "@shared/format";
import type { TransactionDTO } from "@shared/types";
import { parseUsdInput } from "@shared/validation";
import { api } from "@/lib/api";
import { rememberLocalTransaction } from "@/lib/localWrites";
import { useAccount, useLedgerInvalidation, useTransactions } from "@/lib/queries";
import { TX_LABEL } from "@/lib/txMeta";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DetailRow } from "@/components/ui/dialog";
import { Checkbox, DecimalInput, Field, Input, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Money } from "@/components/ui/values";

const REASONS = ["Funding top-up", "Ledger correction", "Promotional credit", "Fee rebate"];

function useAdjustmentSuccess() {
  const invalidate = useLedgerInvalidation();
  return (tx: TransactionDTO, title: string) => {
    rememberLocalTransaction(tx.id);
    void invalidate();
    toast.success(title, { description: `${tx.direction === "in" ? "Credit" : "Debit"} ${formatUsd(tx.gross)} posted · ${tx.id}` });
  };
}

function SetCashForm() {
  const account = useAccount().data;
  const onSuccess = useAdjustmentSuccess();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("Set cash balance");
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const parsed = parseUsdInput(target, { label: "Target cash balance", allowZero: true });
  const current = account ? D(account.cash.spot) : null;
  const delta = parsed.ok && current ? parsed.value.minus(current) : null;
  let error = parsed.ok ? null : parsed.error;
  if (!error && delta?.isZero()) error = "Cash already equals this amount.";
  if (!error && parsed.ok && account && parsed.value.lt(D(account.cash.reserved))) error = `Cash cannot go below the ${formatUsd(account.cash.reserved)} reserved by open orders.`;
  const mutation = useMutation({
    mutationFn: () => api.setCash({ target: parsed.ok ? parsed.value.toFixed(2) : target, reason: reason.trim() || "Set cash balance", confirm: true }),
    onSuccess: (r) => {
      onSuccess(r.transaction, "Cash balance updated");
      setOpen(false);
      setTarget("");
      setTouched(false);
    },
    onError: (e: Error) => toast.error("Cash balance not changed", { description: e.message }),
  });
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-[13px] font-medium text-fg">Set Spot cash balance</p>
      <p className="mt-0.5 text-xs text-muted">Posts the difference as an administrative ledger adjustment. Current Spot cash: {account ? formatUsd(account.cash.spot) : "—"}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <Field label="Target balance (USD)" htmlFor="target-cash" error={touched ? error : null} hint={delta && !error ? `${delta.isPositive() ? "Credit" : "Debit"} of ${formatUsd(delta.abs())}` : undefined}>
          <DecimalInput id="target-cash" value={target} onValueChange={setTarget} onBlur={() => setTouched(true)} prefix="$" placeholder="25000.00" invalid={touched && Boolean(error)} />
        </Field>
        <Field label="Reason" htmlFor="target-reason">
          <Input id="target-reason" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button
          className="sm:mt-[22px]"
          variant="secondary"
          onClick={() => {
            setTouched(true);
            if (!error) setOpen(true);
          }}
        >
          Review
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(o) => !mutation.isPending && setOpen(o)}
        title="Confirm cash balance change"
        description="This posts an administrative adjustment to the ledger."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Post adjustment
            </Button>
          </>
        }
      >
        <DetailRow label="Current Spot cash" value={current ? formatUsd(current) : "—"} />
        <DetailRow label="New Spot cash" value={parsed.ok ? formatUsd(parsed.value) : "—"} strong />
        <DetailRow label="Adjustment" value={delta ? `${delta.isPositive() ? "Credit" : "Debit"} ${formatUsd(delta.abs())}` : "—"} />
        <DetailRow label="Reason" value={reason.trim() || "Set cash balance"} mono={false} />
      </Dialog>
    </div>
  );
}

function AdjustmentForm() {
  const account = useAccount().data;
  const onSuccess = useAdjustmentSuccess();
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [kind, setKind] = useState<"balance" | "fee">("balance");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const parsed = parseUsdInput(amount, { label: "Amount" });
  const available = account ? D(account.cash.availableSpot) : null;
  const errors = {
    amount: parsed.ok ? (direction === "debit" && available && parsed.value.gt(available) ? `Debit exceeds available cash (${formatUsd(available)}).` : null) : parsed.error,
    reason: reason.trim() ? (reason.trim().length > 120 ? "Reason is limited to 120 characters." : null) : "A reason is required.",
    confirm: confirmed ? null : "Confirm the adjustment before posting.",
  };
  const valid = !errors.amount && !errors.reason && !errors.confirm;
  const mutation = useMutation({
    mutationFn: () => api.adjust({ direction, amount: parsed.ok ? parsed.value.toFixed(2) : amount, reason: reason.trim(), note: note.trim() || undefined, kind, confirm: confirmed }),
    onSuccess: (r) => {
      onSuccess(r.transaction, kind === "fee" ? "Fee adjustment posted" : "Balance adjustment posted");
      setOpen(false);
      setAmount("");
      setReason("");
      setNote("");
      setConfirmed(false);
      setTouched(false);
    },
    onError: (e: Error) => toast.error("Adjustment not posted", { description: e.message }),
  });
  const after = parsed.ok && account ? D(account.cash.spot).plus(direction === "credit" ? parsed.value : parsed.value.neg()) : null;

  return (
    <form
      className="rounded-xl border border-line p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid) setOpen(true);
      }}
    >
      <p className="text-[13px] font-medium text-fg">Administrative balance adjustment</p>
      <p className="mt-0.5 text-xs text-muted">Credits or debits the Spot USD ledger and records an auditable entry.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Amount (USD)" htmlFor="adj-amount" error={touched ? errors.amount : null}>
          <DecimalInput id="adj-amount" value={amount} onValueChange={setAmount} prefix="$" placeholder="0.00" invalid={touched && Boolean(errors.amount)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction">
            <Segmented label="Direction" value={direction} onChange={setDirection} options={[{ value: "credit", label: "Credit" }, { value: "debit", label: "Debit" }]} stretch />
          </Field>
          <Field label="Type">
            <Segmented label="Adjustment type" value={kind} onChange={setKind} options={[{ value: "balance", label: "Balance" }, { value: "fee", label: "Fee" }]} stretch />
          </Field>
        </div>
        <Field label="Reason" htmlFor="adj-reason" error={touched ? errors.reason : null}>
          <Input id="adj-reason" list="adj-reasons" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Funding top-up" invalid={touched && Boolean(errors.reason)} />
          <datalist id="adj-reasons">
            {REASONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Note (optional)" htmlFor="adj-note">
          <Textarea id="adj-note" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} rows={2} className="min-h-[36px]" />
        </Field>
      </div>
      <p className="mt-2 text-xs text-subtle">
        {kind === "balance" ? "Balance adjustments count as external flows: they change net contributions, not performance." : "Fee adjustments are trading costs: a debit is a fee charge, a credit is a rebate, and both affect performance."}
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Checkbox label="I confirm this adjustment should be posted to the ledger" checked={confirmed} onChange={setConfirmed} />
          {touched && errors.confirm && (
            <p role="alert" className="mt-1 text-xs text-down">
              {errors.confirm}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary">
          Review adjustment
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(o) => !mutation.isPending && setOpen(o)}
        title="Post ledger adjustment?"
        description="Financially significant change to the account."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button variant={direction === "debit" ? "danger" : "primary"} loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Post {direction}
            </Button>
          </>
        }
      >
        <DetailRow label="Type" value={kind === "fee" ? "Fee adjustment" : "Balance adjustment"} mono={false} />
        <DetailRow label="Direction" value={direction === "credit" ? "Credit (+)" : "Debit (−)"} mono={false} />
        <DetailRow label="Amount" value={parsed.ok ? formatUsd(parsed.value) : "—"} strong />
        <DetailRow label="Spot cash after" value={after ? formatUsd(after) : "—"} />
        <DetailRow label="Reason" value={reason.trim()} mono={false} />
        {note.trim() && <DetailRow label="Note" value={note.trim()} mono={false} />}
      </Dialog>
    </form>
  );
}

export function BalanceSection() {
  const txs = useTransactions();
  const navigate = useNavigate();
  const adjustments = (txs.data ?? []).filter((t) => t.type === "balance_adjustment" || t.type === "fee_adjustment").slice(0, 8);
  return (
    <Card id="balance" className="scroll-mt-20">
      <CardHeader title="Cash & ledger adjustments" description="Change the cash balance through explicit, auditable ledger entries" icon={<Scale className="h-4 w-4" />} />
      <div className="card-p space-y-4 pt-4">
        <SetCashForm />
        <AdjustmentForm />
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Recent adjustments</p>
          {adjustments.length === 0 ? (
            <p className="text-xs text-subtle">No adjustments have been posted.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <Table minWidth={640}>
                <thead>
                  <tr>
                    <Th>Time</Th>
                    <Th>Type</Th>
                    <Th>Reason</Th>
                    <Th align="right">Amount</Th>
                    <Th>ID</Th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((t) => (
                    <Tr key={t.id} onClick={() => navigate(`/transactions/${t.id}`)}>
                      <Td className="num text-muted">{formatShortDateTime(t.createdAt)}</Td>
                      <Td className="text-fg">{TX_LABEL[t.type]}</Td>
                      <Td className="max-w-[220px] truncate text-muted">{t.reason}</Td>
                      <Td align="right">
                        <Money value={t.direction === "in" ? t.gross : `-${t.gross}`} signed tone />
                      </Td>
                      <Td className="num text-xs text-subtle">{t.id}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
