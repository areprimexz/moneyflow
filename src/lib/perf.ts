import { D, Dec } from "@shared/decimal";
import type { PortfolioHistoryDTO } from "@shared/types";

export interface PeriodPerformance {
  startValue: Dec;
  flows: Dec;
  pnl: Dec;
  /** Simple Dietz return: P/L ÷ (start value + ½ net flows). Null when there is no base. */
  pct: Dec | null;
}

/** Performance over a history window, ending at the live portfolio value. */
export function periodPerformance(history: PortfolioHistoryDTO | undefined, currentValue: Dec | null | undefined): PeriodPerformance | null {
  if (!history || !history.available || !currentValue) return null;
  const startValue = D(history.startValue);
  const flows = D(history.flows);
  const pnl = currentValue.minus(startValue).minus(flows).toDecimalPlaces(2);
  const base = startValue.plus(flows.div(2));
  return { startValue, flows, pnl, pct: base.gt(0) ? pnl.div(base) : null };
}

export const RANGE_LABEL: Record<string, string> = { "1H": "1 hour", "24H": "24 hours", "7D": "7 days", "1M": "1 month", "3M": "3 months", "1Y": "1 year", ALL: "all time" };
