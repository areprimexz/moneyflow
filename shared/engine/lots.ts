import { Dec, ZERO, roundUsd } from "../decimal";
import { err, ok, type Result } from "./result";

/**
 * Cost-basis accounting: FIFO lots
 * --------------------------------
 * - Every acquisition (buy, paper deposit of an asset) opens a lot whose cost is the USD
 *   paid including fees (buys) or the market value at the time of deposit (deposits).
 * - Every disposal (sell, paper withdrawal) consumes the oldest lots first.
 * - Partial consumption removes cost proportionally: round(lotCost × q / lotQty, 2).
 *   Consuming the remainder of a lot removes its entire remaining cost, so the cost
 *   removed from a lot always sums exactly to the cost it was opened with.
 * - Realized P/L of a sell = (gross − fee) − cost removed.
 * - Unrealized P/L = market value − remaining cost basis.
 * - Internal transfers between Spot and Vault do not touch lots.
 */
export interface OpenLot {
  id: string;
  openedAt: number;
  quantity: Dec;
  cost: Dec;
}

export interface LotConsumption {
  lotId: string;
  quantity: Dec;
  cost: Dec;
  remainingQuantity: Dec;
  remainingCost: Dec;
}

export function consumeFifo(lots: readonly OpenLot[], quantity: Dec): Result<{ consumptions: LotConsumption[]; costRemoved: Dec }> {
  if (quantity.lte(0)) return err("Quantity must be greater than zero.");
  const ordered = [...lots].filter((l) => l.quantity.gt(0)).sort((a, b) => a.openedAt - b.openedAt || a.id.localeCompare(b.id));
  const available = ordered.reduce((acc, l) => acc.plus(l.quantity), ZERO);
  if (available.lt(quantity)) return err("Not enough quantity in open lots.", "insufficient_quantity");
  let remaining = quantity;
  let costRemoved = ZERO;
  const consumptions: LotConsumption[] = [];
  for (const lot of ordered) {
    if (remaining.lte(0)) break;
    const take = Dec.min(lot.quantity, remaining);
    const cost = take.eq(lot.quantity) ? lot.cost : roundUsd(lot.cost.times(take).div(lot.quantity));
    consumptions.push({ lotId: lot.id, quantity: take, cost, remainingQuantity: lot.quantity.minus(take), remainingCost: lot.cost.minus(cost) });
    costRemoved = costRemoved.plus(cost);
    remaining = remaining.minus(take);
  }
  return ok({ consumptions, costRemoved });
}

export function averageEntryPrice(costBasis: Dec, quantity: Dec): Dec | null {
  if (quantity.lte(0)) return null;
  return costBasis.div(quantity);
}
