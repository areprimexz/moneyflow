import { asc, eq } from "drizzle-orm";
import { requireAsset } from "../../shared/assets";
import { D, Dec, ZERO, roundUsd, toDbString } from "../../shared/decimal";
import { DomainError } from "../../shared/engine/result";
import { DAY_MS, HOUR_MS } from "../../shared/market/controlled";
import type { AnalyticsDTO, PortfolioHistoryDTO, PortfolioPointDTO, PortfolioRange, PositionDetailDTO, PriceSourceKind, TransactionDTO } from "../../shared/types";
import { accounts, ledgerEntries, lotConsumptions, lots, transactions } from "../db/schema";
import { ACCOUNT_ID, type Ctx } from "./context";
import { USD, toTransactionDTO } from "./ledger";

const RANGE_MS: Record<Exclude<PortfolioRange, "ALL">, number> = {
  "1H": HOUR_MS,
  "24H": DAY_MS,
  "7D": 7 * DAY_MS,
  "1M": 30 * DAY_MS,
  "3M": 90 * DAY_MS,
  "1Y": 365 * DAY_MS,
};
const RANGE_POINTS: Record<PortfolioRange, number> = { "1H": 60, "24H": 288, "7D": 336, "1M": 360, "3M": 360, "1Y": 365, ALL: 400 };

export function isRange(v: string): v is PortfolioRange {
  return v in RANGE_POINTS;
}

function baseline(ctx: Ctx): number {
  const row = ctx.db.select({ baselineAt: accounts.baselineAt }).from(accounts).where(eq(accounts.id, ACCOUNT_ID)).get();
  if (!row) throw new DomainError("Account is not initialised.", "no_account", 500);
  return row.baselineAt;
}

export function rangeStart(range: PortfolioRange, baselineAt: number, now: number): number {
  if (range === "ALL") return Math.min(baselineAt, now);
  return Math.min(now, Math.max(now - RANGE_MS[range], baselineAt));
}

interface Valuations {
  available: boolean;
  source: PriceSourceKind;
  message: string | null;
  points: PortfolioPointDTO[];
  /** Market value per symbol at each sample time. */
  bySymbol: Map<string, number[]>;
}

/** Replay the ledger and value the portfolio at each sample time with the active price source. */
async function valueAt(ctx: Ctx, times: number[], now: number): Promise<Valuations> {
  const entries = ctx.db
    .select({ asset: ledgerEntries.asset, amount: ledgerEntries.amount, createdAt: ledgerEntries.createdAt })
    .from(ledgerEntries)
    .orderBy(asc(ledgerEntries.createdAt))
    .all();
  const symbols = [...new Set(entries.map((e) => e.asset).filter((a) => a !== USD))];
  const series = await ctx.market.priceSeries(symbols, times, now);
  const bySymbol = new Map<string, number[]>(symbols.map((s) => [s, []]));
  if (!series.available) return { available: false, source: series.source, message: series.message, points: [], bySymbol };
  const qty = new Map<string, Dec>();
  let cash = ZERO;
  let i = 0;
  const points: PortfolioPointDTO[] = [];
  times.forEach((t, idx) => {
    while (i < entries.length && entries[i]!.createdAt <= t) {
      const e = entries[i]!;
      if (e.asset === USD) cash = cash.plus(D(e.amount));
      else qty.set(e.asset, (qty.get(e.asset) ?? ZERO).plus(D(e.amount)));
      i++;
    }
    let holdings = 0;
    for (const s of symbols) {
      const q = qty.get(s);
      const price = series.prices.get(s)?.[idx] ?? 0;
      const v = q && !q.isZero() ? q.toNumber() * price : 0;
      bySymbol.get(s)!.push(v);
      holdings += v;
    }
    const c = cash.toNumber();
    points.push({ time: t, value: round2(c + holdings), cash: round2(c), holdings: round2(holdings) });
  });
  return { available: true, source: series.source, message: null, points, bySymbol };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function sampleTimes(from: number, to: number, count: number): number[] {
  if (to - from < 1000) return [from, to].filter((v, i, arr) => arr.indexOf(v) === i);
  const step = Math.max(1000, Math.floor((to - from) / count));
  const out: number[] = [];
  for (let t = from; t < to; t += step) out.push(t);
  out.push(to);
  return out;
}

function flowRows(ctx: Ctx) {
  return ctx.db
    .select({ createdAt: transactions.createdAt, flowValue: transactions.flowValue, isFlow: transactions.isFlow })
    .from(transactions)
    .all()
    .filter((r) => r.isFlow);
}

export async function portfolioHistory(ctx: Ctx, range: PortfolioRange): Promise<PortfolioHistoryDTO> {
  const now = ctx.now();
  const from = rangeStart(range, baseline(ctx), now);
  const times = sampleTimes(from, now, RANGE_POINTS[range]);
  const v = await valueAt(ctx, times, now);
  const flows = flowRows(ctx)
    .filter((r) => r.createdAt > from && r.createdAt <= now)
    .reduce((acc, r) => acc.plus(D(r.flowValue)), ZERO);
  return {
    range,
    from,
    to: now,
    available: v.available,
    message: v.message,
    source: v.source,
    points: v.points,
    startValue: v.points.length ? new Dec(v.points[0]!.value).toFixed(2) : "0",
    flows: toDbString(flows),
  };
}

const ANALYTICS_RANGE_DAYS: Partial<Record<PortfolioRange, number>> = { "7D": 7, "1M": 30, "3M": 90, "1Y": 365 };

/**
 * Analytics definitions
 *  - Daily P/L        = V(end of day) − V(start of day) − net external flows during the day
 *  - Daily return     = Daily P/L / (V(start) + ½·flows)            (simple Dietz)
 *  - Cumulative/monthly return = chained daily returns              (time-weighted)
 *  - Asset P/L        = V_end − V_start − net cash invested in the asset during the range
 *  - Win/loss         = sells in range with positive/negative realized P/L (FIFO basis)
 * Days are UTC calendar days.
 */
export async function analytics(ctx: Ctx, range: PortfolioRange): Promise<AnalyticsDTO> {
  const now = ctx.now();
  const baselineAt = baseline(ctx);
  const days = ANALYTICS_RANGE_DAYS[range];
  const from = days ? Math.max(baselineAt, now - days * DAY_MS) : baselineAt;
  // Day boundaries (UTC midnight) inside the range, plus the range start and now.
  const bounds = [from];
  for (let t = Math.floor(from / DAY_MS) * DAY_MS + DAY_MS; t < now; t += DAY_MS) bounds.push(t);
  if (now > from) bounds.push(now);
  const historyTimes = sampleTimes(from, now, 240);
  const allTimes = [...new Set([...bounds, ...historyTimes])].sort((a, b) => a - b);
  const v = await valueAt(ctx, allTimes, now);
  const txRows = ctx.db.select().from(transactions).orderBy(asc(transactions.createdAt)).all();
  const inRange = txRows.filter((t) => t.createdAt > from && t.createdAt <= now);

  const empty: AnalyticsDTO = {
    range,
    available: v.available,
    message: v.message,
    history: [],
    dailyPnl: [],
    monthly: [],
    cumulativeReturn: [],
    volume: [],
    totals: { startValue: "0", endValue: "0", flows: "0", pnl: "0", returnPct: null, realizedPnl: "0", tradingVolume: "0", feesPaid: "0", trades: 0, buys: 0, sells: 0 },
    winLoss: { closedTrades: 0, wins: 0, losses: 0, winRate: null, averageWin: null, averageLoss: null, profitFactor: null, largestWin: null, largestLoss: null },
    assetPerformance: [],
  };
  if (!v.available || v.points.length === 0) return empty;

  const valueAtTime = new Map(v.points.map((p) => [p.time, p.value]));
  const historySet = new Set(historyTimes);
  const history = v.points.filter((p) => historySet.has(p.time));

  // Daily P/L and time-weighted returns.
  const dailyPnl: AnalyticsDTO["dailyPnl"] = [];
  const cumulativeReturn: AnalyticsDTO["cumulativeReturn"] = [{ time: from, value: 0 }];
  const monthlyMap = new Map<string, { startValue: number; endValue: number; flows: number; growth: number; valid: boolean }>();
  let growth = 1;
  for (let k = 0; k + 1 < bounds.length; k++) {
    const start = bounds[k]!;
    const end = bounds[k + 1]!;
    const v0 = valueAtTime.get(start) ?? 0;
    const v1 = valueAtTime.get(end) ?? 0;
    const flows = txRows.filter((t) => t.isFlow && t.createdAt > start && t.createdAt <= end).reduce((acc, t) => acc + Number(t.flowValue), 0);
    const pnl = round2(v1 - v0 - flows);
    const denom = v0 + flows / 2;
    const r = denom > 0 ? pnl / denom : 0;
    growth *= 1 + r;
    dailyPnl.push({ time: start, pnl });
    cumulativeReturn.push({ time: end, value: growth - 1 });
    const month = new Date(start).toISOString().slice(0, 7);
    const m = monthlyMap.get(month);
    if (!m) monthlyMap.set(month, { startValue: v0, endValue: v1, flows, growth: 1 + r, valid: denom > 0 });
    else {
      m.endValue = v1;
      m.flows += flows;
      m.growth *= 1 + r;
      m.valid = m.valid || denom > 0;
    }
  }
  const monthly = [...monthlyMap.entries()].map(([month, m]) => ({
    month,
    startValue: round2(m.startValue),
    endValue: round2(m.endValue),
    flows: round2(m.flows),
    returnPct: m.valid ? m.growth - 1 : null,
  }));

  // Trading volume per day.
  const volumeMap = new Map<number, { buy: number; sell: number }>();
  let tradingVolume = ZERO;
  let feesPaid = ZERO;
  let realized = ZERO;
  let buys = 0;
  let sells = 0;
  const wins: Dec[] = [];
  const losses: Dec[] = [];
  for (const t of inRange) {
    if (t.type === "buy" || t.type === "sell") {
      const day = Math.floor(t.createdAt / DAY_MS) * DAY_MS;
      const bucket = volumeMap.get(day) ?? { buy: 0, sell: 0 };
      bucket[t.type] += Number(t.gross);
      volumeMap.set(day, bucket);
      tradingVolume = tradingVolume.plus(D(t.gross));
      feesPaid = feesPaid.plus(D(t.fee));
      if (t.type === "buy") buys++;
      else {
        sells++;
        const pnl = D(t.realizedPnl ?? "0");
        realized = realized.plus(pnl);
        if (pnl.gt(0)) wins.push(pnl);
        else if (pnl.lt(0)) losses.push(pnl);
      }
    } else if (t.type === "withdrawal") feesPaid = feesPaid.plus(D(t.fee));
    else if (t.type === "fee_adjustment") feesPaid = t.direction === "out" ? feesPaid.plus(D(t.fee)) : feesPaid.minus(D(t.fee));
  }
  const volume = [...volumeMap.entries()].sort((a, b) => a[0] - b[0]).map(([time, b]) => ({ time, buy: round2(b.buy), sell: round2(b.sell) }));
  const sumDec = (xs: Dec[]) => xs.reduce((a, b) => a.plus(b), ZERO);
  const totalWins = sumDec(wins);
  const totalLosses = sumDec(losses).abs();
  const closed = wins.length + losses.length;

  // Per-asset performance over the range.
  const startIdx = 0;
  const endIdx = v.points.length - 1;
  const assetPerformance: AnalyticsDTO["assetPerformance"] = [];
  for (const [symbol, values] of v.bySymbol) {
    const startValue = values[startIdx] ?? 0;
    const endValue = values[endIdx] ?? 0;
    let netInvested = ZERO;
    let deployed = ZERO;
    let symRealized = ZERO;
    for (const t of inRange) {
      if (t.asset !== symbol) continue;
      if (t.type === "buy") {
        netInvested = netInvested.plus(D(t.net));
        deployed = deployed.plus(D(t.net));
      } else if (t.type === "sell") {
        netInvested = netInvested.minus(D(t.net));
        symRealized = symRealized.plus(D(t.realizedPnl ?? "0"));
      } else if (t.type === "deposit") {
        netInvested = netInvested.plus(D(t.gross));
        deployed = deployed.plus(D(t.gross));
      } else if (t.type === "withdrawal") netInvested = netInvested.minus(D(t.gross));
    }
    if (startValue === 0 && endValue === 0 && netInvested.isZero() && symRealized.isZero()) continue;
    const pnl = roundUsd(new Dec(endValue).minus(startValue).minus(netInvested));
    const capital = new Dec(startValue).plus(deployed);
    assetPerformance.push({
      symbol,
      startValue: new Dec(startValue).toFixed(2),
      endValue: new Dec(endValue).toFixed(2),
      netInvested: netInvested.toFixed(2),
      pnl: pnl.toFixed(2),
      returnPct: capital.gt(0) ? pnl.div(capital).toDecimalPlaces(6).toFixed() : null,
      realizedPnl: symRealized.toFixed(2),
    });
  }
  assetPerformance.sort((a, b) => Number(b.pnl) - Number(a.pnl));

  const startValue = new Dec(v.points[0]!.value);
  const endValue = new Dec(v.points[endIdx]!.value);
  const flows = inRange.filter((t) => t.isFlow).reduce((acc, t) => acc.plus(D(t.flowValue)), ZERO);
  const hasReturnBase = dailyPnl.length > 0 && (startValue.gt(0) || flows.gt(0));
  return {
    range,
    available: true,
    message: null,
    history,
    dailyPnl,
    monthly,
    cumulativeReturn,
    volume,
    totals: {
      startValue: startValue.toFixed(2),
      endValue: endValue.toFixed(2),
      flows: flows.toFixed(2),
      pnl: roundUsd(endValue.minus(startValue).minus(flows)).toFixed(2),
      returnPct: hasReturnBase ? new Dec(growth - 1).toDecimalPlaces(6).toFixed() : null,
      realizedPnl: realized.toFixed(2),
      tradingVolume: tradingVolume.toFixed(2),
      feesPaid: feesPaid.toFixed(2),
      trades: buys + sells,
      buys,
      sells,
    },
    winLoss: {
      closedTrades: closed,
      wins: wins.length,
      losses: losses.length,
      winRate: closed > 0 ? new Dec(wins.length).div(closed).toDecimalPlaces(6).toFixed() : null,
      averageWin: wins.length ? totalWins.div(wins.length).toFixed(2) : null,
      averageLoss: losses.length ? totalLosses.div(losses.length).neg().toFixed(2) : null,
      profitFactor: losses.length && totalLosses.gt(0) ? totalWins.div(totalLosses).toDecimalPlaces(4).toFixed() : null,
      largestWin: wins.length ? wins.reduce((a, b) => (b.gt(a) ? b : a)).toFixed(2) : null,
      largestLoss: losses.length ? losses.reduce((a, b) => (b.lt(a) ? b : a)).toFixed(2) : null,
    },
    assetPerformance,
  };
}

export function positionDetail(ctx: Ctx, symbol: string): PositionDetailDTO {
  const asset = requireAsset(symbol);
  const lotRows = ctx.db.select().from(lots).where(eq(lots.symbol, asset.symbol)).orderBy(asc(lots.openedAt)).all();
  const consumptions = ctx.db.select().from(lotConsumptions).all();
  const used = new Map<string, { q: Dec; c: Dec }>();
  for (const c of consumptions) {
    const u = used.get(c.lotId) ?? { q: ZERO, c: ZERO };
    used.set(c.lotId, { q: u.q.plus(D(c.quantity)), c: u.c.plus(D(c.cost)) });
  }
  const txs: TransactionDTO[] = ctx.db
    .select()
    .from(transactions)
    .where(eq(transactions.asset, asset.symbol))
    .orderBy(asc(transactions.createdAt), asc(transactions.seq))
    .all()
    .map((r) => toTransactionDTO(r));
  return {
    symbol: asset.symbol,
    lots: lotRows.map((l) => {
      const u = used.get(l.id) ?? { q: ZERO, c: ZERO };
      return {
        id: l.id,
        symbol: l.symbol,
        openedAt: l.openedAt,
        transactionId: l.transactionId,
        originalQuantity: l.quantity,
        originalCost: l.cost,
        quantity: toDbString(D(l.quantity).minus(u.q)),
        cost: toDbString(D(l.cost).minus(u.c)),
      };
    }),
    transactions: txs.reverse(),
  };
}

