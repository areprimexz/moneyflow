import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BadgeDollarSign, Minus, Plus, Scale, type LucideIcon } from "lucide-react";
import type { TransactionDTO, TransactionType } from "@shared/types";

export const TX_LABEL: Record<TransactionType, string> = {
  buy: "Buy",
  sell: "Sell",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer: "Internal transfer",
  fee_adjustment: "Fee adjustment",
  balance_adjustment: "Balance adjustment",
};

export const TX_ICON: Record<TransactionType, LucideIcon> = {
  buy: Plus,
  sell: Minus,
  deposit: ArrowDownLeft,
  withdrawal: ArrowUpRight,
  transfer: ArrowLeftRight,
  fee_adjustment: BadgeDollarSign,
  balance_adjustment: Scale,
};

export function txTone(t: TransactionDTO): "up" | "down" | "neutral" | "accent" {
  if (t.type === "buy") return "up";
  if (t.type === "sell") return "down";
  if (t.direction === "internal") return "neutral";
  return t.direction === "in" ? "accent" : "neutral";
}

/** Signed USD effect on cash used in lists (buy = −net, sell = +net …). */
export function cashEffect(t: TransactionDTO): string | null {
  switch (t.type) {
    case "buy":
      return `-${t.net}`;
    case "sell":
      return t.net;
    case "transfer":
      return null;
    default:
      if (t.asset !== "USD") return null;
      return t.direction === "in" ? t.net : `-${t.net}`;
  }
}

export function accountLabel(a: "spot" | "vault"): string {
  return a === "spot" ? "Spot" : "Vault";
}
