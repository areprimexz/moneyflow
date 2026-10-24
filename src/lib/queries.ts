import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { valuePortfolio } from "@shared/engine/portfolio";
import type { CandleInterval, PortfolioRange, Preferences, QuoteDTO, SettingsDTO } from "@shared/types";
import { DEFAULT_PREFERENCES } from "@shared/types";
import { api } from "./api";

/**
 * Shared data layer: every component reads market and account data through these
 * hooks, so each resource is fetched once and cached, never per component.
 */
export const qk = {
  quotes: ["quotes"] as const,
  account: ["account"] as const,
  orders: ["orders"] as const,
  transactions: ["transactions"] as const,
  settings: ["settings"] as const,
  sparklines: ["sparklines"] as const,
  history: (range: PortfolioRange) => ["history", range] as const,
  analytics: (range: PortfolioRange) => ["analytics", range] as const,
  candles: (symbol: string, interval: CandleInterval) => ["candles", symbol, interval] as const,
  depth: (symbol: string) => ["depth", symbol] as const,
  tape: (symbol: string) => ["tape", symbol] as const,
  position: (symbol: string) => ["position", symbol] as const,
  transaction: (id: string) => ["transaction", id] as const,
};

export function useQuotes() {
  const q = useQuery({
    queryKey: qk.quotes,
    queryFn: api.quotes,
    refetchInterval: (query) => (query.state.data?.mode === "live" ? 15_000 : 2_500),
    placeholderData: keepPreviousData,
  });
  const bySymbol = useMemo(() => new Map<string, QuoteDTO>((q.data?.quotes ?? []).map((x) => [x.symbol, x])), [q.data]);
  return { ...q, bySymbol };
}

export function useQuote(symbol: string | undefined): QuoteDTO | undefined {
  const { bySymbol } = useQuotes();
  return symbol ? bySymbol.get(symbol) : undefined;
}

export function useAccount() {
  return useQuery({ queryKey: qk.account, queryFn: api.account, refetchInterval: 4_000, placeholderData: keepPreviousData });
}

/** Account + live quotes → valuation, using the shared valuation engine. */
export function usePortfolio() {
  const account = useAccount();
  const quotes = useQuotes();
  const valuation = useMemo(() => (account.data && quotes.data ? valuePortfolio(account.data, quotes.data.quotes) : null), [account.data, quotes.data]);
  return { account: account.data, quotes: quotes.data, valuation, isLoading: account.isLoading || quotes.isLoading, error: account.error ?? quotes.error };
}

export function useOrders() {
  return useQuery({ queryKey: qk.orders, queryFn: api.orders, refetchInterval: 4_000, select: (d) => d.orders, placeholderData: keepPreviousData });
}

export function useTransactions() {
  return useQuery({ queryKey: qk.transactions, queryFn: api.transactions, refetchInterval: 15_000, select: (d) => d.transactions, placeholderData: keepPreviousData });
}

export function useTransaction(id: string | undefined) {
  return useQuery({ queryKey: qk.transaction(id ?? ""), queryFn: () => api.transaction(id!), enabled: Boolean(id) });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.settings, staleTime: 10_000 });
}

export function usePreferences(): Preferences {
  const s = useSettings();
  return s.data?.preferences ?? DEFAULT_PREFERENCES;
}

export function useHistory(range: PortfolioRange) {
  return useQuery({
    queryKey: qk.history(range),
    queryFn: () => api.history(range),
    refetchInterval: range === "1H" ? 10_000 : range === "24H" ? 30_000 : 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useAnalytics(range: PortfolioRange) {
  return useQuery({ queryKey: qk.analytics(range), queryFn: () => api.analytics(range), refetchInterval: 60_000, placeholderData: keepPreviousData });
}

const CANDLE_REFRESH: Record<CandleInterval, number> = { "1m": 5_000, "5m": 10_000, "15m": 15_000, "1h": 30_000, "4h": 60_000, "1D": 120_000, "1W": 300_000 };

export function useCandles(symbol: string, interval: CandleInterval) {
  return useQuery({ queryKey: qk.candles(symbol, interval), queryFn: () => api.candles(symbol, interval), refetchInterval: CANDLE_REFRESH[interval] });
}

export function useDepth(symbol: string) {
  return useQuery({ queryKey: qk.depth(symbol), queryFn: () => api.depth(symbol), refetchInterval: 2_000, placeholderData: keepPreviousData });
}

export function useTape(symbol: string) {
  return useQuery({ queryKey: qk.tape(symbol), queryFn: () => api.tape(symbol), refetchInterval: 2_500, placeholderData: keepPreviousData });
}

export function useSparklines() {
  return useQuery({ queryKey: qk.sparklines, queryFn: api.sparklines, refetchInterval: 120_000, staleTime: 60_000 });
}

export function usePosition(symbol: string) {
  return useQuery({ queryKey: qk.position(symbol), queryFn: () => api.position(symbol), refetchInterval: 15_000 });
}

/** Invalidate everything derived from the ledger after a successful write. */
export function useLedgerInvalidation() {
  const qc = useQueryClient();
  return useCallback(
    () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.account }),
      qc.invalidateQueries({ queryKey: qk.orders }),
      qc.invalidateQueries({ queryKey: qk.transactions }),
      qc.invalidateQueries({ queryKey: ["history"] }),
      qc.invalidateQueries({ queryKey: ["analytics"] }),
      qc.invalidateQueries({ queryKey: ["position"] }),
    ]),
    [qc],
  );
}

export function useMarketInvalidation() {
  const qc = useQueryClient();
  return useCallback(
    () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.quotes }),
      qc.invalidateQueries({ queryKey: qk.settings }),
      qc.invalidateQueries({ queryKey: ["candles"] }),
      qc.invalidateQueries({ queryKey: ["depth"] }),
      qc.invalidateQueries({ queryKey: ["tape"] }),
      qc.invalidateQueries({ queryKey: qk.sparklines }),
      qc.invalidateQueries({ queryKey: ["history"] }),
      qc.invalidateQueries({ queryKey: ["analytics"] }),
      qc.invalidateQueries({ queryKey: qk.account }),
      qc.invalidateQueries({ queryKey: qk.orders }),
    ]),
    [qc],
  );
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updatePreferences,
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.settings });
      const prev = qc.getQueryData<SettingsDTO>(qk.settings);
      qc.setQueryData<SettingsDTO>(qk.settings, (old) => (old ? { ...old, preferences: { ...old.preferences, ...patch } } : old));
      return { prev };
    },
    onError: (_e, _patch, context) => {
      if (context?.prev) qc.setQueryData(qk.settings, context.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.settings }),
  });
}

export function useWatchlist() {
  const qc = useQueryClient();
  const settings = useSettings();
  const list = settings.data?.watchlist ?? [];
  const toggle = useMutation({
    mutationFn: (symbol: string) => (list.includes(symbol) ? api.unwatch(symbol) : api.watch(symbol)),
    onSuccess: (data) => qc.setQueryData<SettingsDTO>(qk.settings, (old) => (old ? { ...old, watchlist: data.watchlist } : old)),
  });
  return { list, toggle };
}
