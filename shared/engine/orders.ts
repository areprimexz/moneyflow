import type { AssetMeta } from "../assets";
import { D, Dec, ZERO, roundUsd } from "../decimal";
import { LIMITS } from "../validation";
import { computeFee } from "./fees";
import { err, ok, type Result } from "./result";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "open" | "filled" | "cancelled" | "rejected";

export interface TradePlan {
  side: OrderSide;
  quantity: Dec;
  unitPrice: Dec;
  /** quantity × unitPrice, rounded to cents. */
  gross: Dec;
  fee: Dec;
  /** Cash leaving the account for a buy (gross + fee) or arriving for a sell (gross − fee). */
  net: Dec;
}

export function validateQuantity(quantity: Dec, asset: AssetMeta): Result<Dec> {
  if (!quantity.isFinite()) return err("Quantity must be a finite number.", "invalid_quantity");
  if (quantity.lte(0)) return err("Quantity must be greater than zero.", "invalid_quantity");
  if (quantity.decimalPlaces() > asset.qtyDecimals) {
    return err(
      asset.qtyDecimals === 0 ? `${asset.symbol} quantity must be a whole number.` : `${asset.symbol} quantity supports at most ${asset.qtyDecimals} decimal places.`,
      "invalid_quantity",
    );
  }
  return ok(quantity);
}

export function validateLimitPrice(price: Dec, asset: AssetMeta): Result<Dec> {
  if (!price.isFinite() || price.lte(0)) return err("Limit price must be greater than zero.", "invalid_price");
  if (price.decimalPlaces() > asset.priceDecimals) return err(`${asset.symbol} prices support at most ${asset.priceDecimals} decimal places.`, "invalid_price");
  if (price.gt(LIMITS.maxAssetPrice)) return err("Limit price exceeds the maximum allowed price.", "invalid_price");
  return ok(price);
}

/** Price a trade (no balance checks). */
export function planTrade(input: { side: OrderSide; quantity: Dec; unitPrice: Dec; feeRate: Dec; asset: AssetMeta }): Result<TradePlan> {
  const q = validateQuantity(input.quantity, input.asset);
  if (!q.ok) return q;
  if (!input.unitPrice.isFinite() || input.unitPrice.lte(0)) return err("No valid market price is available.", "no_price");
  const gross = roundUsd(input.quantity.times(input.unitPrice));
  if (gross.lt(LIMITS.minOrderValue)) return err(`Order value must be at least $${LIMITS.minOrderValue.toFixed(2)}.`, "below_minimum");
  if (gross.gt(LIMITS.maxOrderValue)) return err("Order value exceeds the maximum allowed order size.", "above_maximum");
  const fee = computeFee(gross, input.feeRate);
  const net = input.side === "buy" ? gross.plus(fee) : gross.minus(fee);
  return ok({ side: input.side, quantity: input.quantity, unitPrice: input.unitPrice, gross, fee, net });
}

export function checkAffordability(plan: TradePlan, availableCash: Dec, availableQuantity: Dec): Result<TradePlan> {
  if (plan.side === "buy" && plan.net.gt(availableCash)) {
    return err(`Insufficient funds: this order requires $${plan.net.toFixed(2)} but only $${roundUsd(availableCash).toFixed(2)} is available.`, "insufficient_funds");
  }
  if (plan.side === "sell" && plan.quantity.gt(availableQuantity)) {
    return err(`Insufficient balance: you can sell at most ${availableQuantity.toFixed()} available.`, "insufficient_quantity");
  }
  return ok(plan);
}

/** Largest buy quantity affordable with `cash` at `price` including fees. */
export function maxBuyQuantity(cash: Dec, price: Dec, feeRate: Dec, asset: AssetMeta): Dec {
  if (cash.lte(0) || price.lte(0)) return ZERO;
  let q = cash.div(price.times(D(1).plus(feeRate))).toDecimalPlaces(asset.qtyDecimals, Dec.ROUND_DOWN);
  // Rounding of gross/fee to cents can push the total a cent over; step down until affordable.
  const step = new Dec(1).div(new Dec(10).pow(asset.qtyDecimals));
  for (let i = 0; i < 1000 && q.gt(0); i++) {
    const gross = roundUsd(q.times(price));
    if (gross.plus(computeFee(gross, feeRate)).lte(cash)) return q;
    q = q.minus(step);
  }
  return q.gt(0) ? q : ZERO;
}

/** Quantity from a USD order value (gross, before fees), rounded down to the asset step. */
export function quantityFromValue(value: Dec, price: Dec, asset: AssetMeta): Dec {
  if (price.lte(0)) return ZERO;
  return value.div(price).toDecimalPlaces(asset.qtyDecimals, Dec.ROUND_DOWN);
}

/** A limit order is marketable when it would execute immediately at the current price. */
export function isMarketable(side: OrderSide, limitPrice: Dec, marketPrice: Dec): boolean {
  return side === "buy" ? marketPrice.lte(limitPrice) : marketPrice.gte(limitPrice);
}

/** Cash reserved by an open buy limit order: the worst-case cost at the limit price. */
export function limitBuyReservation(quantity: Dec, limitPrice: Dec, feeRate: Dec): Dec {
  const gross = roundUsd(quantity.times(limitPrice));
  return gross.plus(computeFee(gross, feeRate));
}
