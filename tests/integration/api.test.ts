import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../../server/app";
import { createFlux } from "../../server/flux";
import { CoinGeckoProvider } from "../../server/market/coingecko";
import { FakeClock, makeFlux } from "../helpers";

let close: (() => void) | null = null;
afterEach(() => {
  close?.();
  close = null;
});

function setup() {
  const f = makeFlux();
  close = () => f.close();
  const app = createApi(f.ctx);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON in assertions
    return { status: res.status, json: (await res.json()) as Record<string, any> };
  };
  return { f, call };
}

describe("HTTP API", () => {
  it("serves account, quotes and history", async () => {
    const { call } = setup();
    expect((await call("GET", "/api/account")).json.cash.total).toBe("9999");
    const quotes = await call("GET", "/api/market/quotes");
    expect(quotes.json.mode).toBe("controlled");
    expect(quotes.json.quotes).toHaveLength(10);
    const history = await call("GET", "/api/portfolio/history?range=24H");
    expect(history.json.available).toBe(true);
    expect((await call("GET", "/api/portfolio/history?range=5Y")).status).toBe(400);
  });

  it("validates order input and returns 4xx without side effects", async () => {
    const { call } = setup();
    expect((await call("POST", "/api/orders", { clientOrderId: "abcdefgh1", symbol: "BTC", side: "buy", type: "market", quantity: "NaN" })).status).toBe(400);
    expect((await call("POST", "/api/orders", { clientOrderId: "abcdefgh2", symbol: "BTC", side: "hold", type: "market", quantity: "1" })).status).toBe(400);
    const r = await call("POST", "/api/orders", { clientOrderId: "abcdefgh3", symbol: "BTC", side: "buy", type: "market", quantity: "10" });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("insufficient_funds");
    expect((await call("GET", "/api/transactions")).json.transactions).toHaveLength(1);
  });

  it("is idempotent for resubmitted orders", async () => {
    const { call } = setup();
    const body = { clientOrderId: "idempotent-1", symbol: "ETH", side: "buy", type: "market", quantity: "0.1" };
    const a = await call("POST", "/api/orders", body);
    const b = await call("POST", "/api/orders", body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json.duplicate).toBe(true);
    expect((await call("GET", "/api/transactions")).json.transactions).toHaveLength(2);
  });

  it("requires typed confirmation for reset and confirmation for adjustments", async () => {
    const { call } = setup();
    await call("POST", "/api/orders", { clientOrderId: "before-reset", symbol: "SOL", side: "buy", type: "market", quantity: "1" });
    const denied = await call("POST", "/api/account/reset", { confirm: "yes please" });
    expect(denied.status).toBe(400);
    expect(denied.json.error.code).toBe("confirmation_required");
    expect((await call("GET", "/api/account")).json.positions).toHaveLength(1);
    const unconfirmed = await call("POST", "/api/account/adjustments", { direction: "credit", amount: "100", reason: "x", confirm: false });
    expect(unconfirmed.status).toBe(400);
    const ok = await call("POST", "/api/account/reset", { confirm: "RESET", initialBalance: "250000" });
    expect(ok.json.account.cash.total).toBe("250000");
  });

  it("rejects preference changes that are invalid and persists valid ones", async () => {
    const { call } = setup();
    expect((await call("PATCH", "/api/settings/preferences", { theme: "neon" })).status).toBe(400);
    expect((await call("PATCH", "/api/settings/preferences", { currency: "MYR" })).status).toBe(400);
    const ok = await call("PATCH", "/api/settings/preferences", { theme: "light", density: "compact" });
    expect(ok.json.preferences.theme).toBe("light");
    // Preferences never touch the ledger.
    expect((await call("GET", "/api/account")).json.totals.transactionCount).toBe(1);
  });
});

function mockFetch(handler: (url: string) => { status: number; body?: unknown; headers?: Record<string, string> } | Error) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = handler(url);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }) as typeof fetch;
  return { fn, calls };
}

const MARKETS = [
  { id: "bitcoin", current_price: 101000.5, price_change_percentage_24h: -1.5, total_volume: 1e10, high_24h: 103000, low_24h: 99000, last_updated: "2026-10-01T12:00:00.000Z" },
  { id: "ethereum", current_price: 3900.25, price_change_percentage_24h: 2.5, total_volume: 5e9, high_24h: 4000, low_24h: 3800, last_updated: "2026-10-01T12:00:00.000Z" },
];

describe("live reference prices", () => {
  it("uses provider prices, labels them live, and trades at them", async () => {
    const clock = new FakeClock();
    const mock = mockFetch(() => ({ status: 200, body: MARKETS }));
    const f = createFlux({ dbPath: ":memory:", now: clock.now, provider: new CoinGeckoProvider({ fetchImpl: mock.fn }) });
    close = () => f.close();
    f.ctx.market.setMode("live", clock.t);
    await f.ctx.market.refreshLive(clock.t, true);
    const q = f.ctx.market.quotes(Date.now());
    expect(q.status).toBe("ok");
    const btc = q.quotes.find((x) => x.symbol === "BTC")!;
    expect(btc.source).toBe("live");
    expect(btc.price).toBe("101000.50");
    // Assets missing from the provider fall back to clearly labelled controlled prices.
    expect(q.quotes.find((x) => x.symbol === "SOL")!.source).toBe("controlled-fallback");
    const r = f.ctx.market.executionPrice("BTC", Date.now());
    expect(r.ok && r.value.price.toFixed()).toBe("101000.5");
    expect(mock.calls[0]).toContain("/coins/markets");
  });

  it("reports unavailability, pauses trading and never claims live prices on failure", async () => {
    const clock = new FakeClock();
    const mock = mockFetch(() => new Error("ECONNREFUSED"));
    const f = createFlux({ dbPath: ":memory:", now: clock.now, provider: new CoinGeckoProvider({ fetchImpl: mock.fn }) });
    close = () => f.close();
    f.ctx.market.setMode("live", clock.t);
    await f.ctx.market.refreshLive(clock.t, true);
    const q = f.ctx.market.quotes(clock.t);
    expect(q.status).toBe("unavailable");
    expect(q.quotes.every((x) => x.source === "controlled-fallback")).toBe(true);
    expect(q.message).toContain("unavailable");
    const r = f.ctx.market.executionPrice("BTC", clock.t);
    expect(r.ok).toBe(false);
    // Switching back to controlled mode keeps the app fully usable.
    f.ctx.market.setMode("controlled", clock.t);
    expect(f.ctx.market.executionPrice("BTC", clock.t).ok).toBe(true);
  });

  it("backs off when rate limited and marks old data stale", async () => {
    let status = 200;
    const mock = mockFetch(() => (status === 429 ? { status: 429, headers: { "retry-after": "120" } } : { status, body: MARKETS }));
    const f = createFlux({ dbPath: ":memory:", provider: new CoinGeckoProvider({ fetchImpl: mock.fn }), livePollMs: 1000 });
    close = () => f.close();
    f.ctx.market.setMode("live", Date.now());
    await f.ctx.market.refreshLive(Date.now(), true);
    expect(f.ctx.market.quotes(Date.now()).status).toBe("ok");
    status = 429;
    await f.ctx.market.refreshLive(Date.now() + 5_000, true);
    const callsAfter429 = mock.calls.length;
    await f.ctx.market.refreshLive(Date.now() + 10_000, true);
    expect(mock.calls.length).toBe(callsAfter429); // still inside the retry-after window
    // Five minutes later, the cached data is reported as stale and market orders pause.
    const later = Date.now() + 5 * 60_000;
    const q = f.ctx.market.quotes(later);
    expect(q.status).toBe("degraded");
    expect(q.quotes.find((x) => x.symbol === "BTC")!.stale).toBe(true);
    const r = f.ctx.market.executionPrice("BTC", later);
    expect(!r.ok && r.code).toBe("price_stale");
  });

  it("caches quotes instead of fetching on every request", async () => {
    const mock = mockFetch(() => ({ status: 200, body: MARKETS }));
    const f = createFlux({ dbPath: ":memory:", provider: new CoinGeckoProvider({ fetchImpl: mock.fn }), livePollMs: 30_000 });
    close = () => f.close();
    f.ctx.market.setMode("live", Date.now());
    await f.ctx.market.refreshLive(Date.now(), true);
    for (let i = 0; i < 5; i++) await f.ctx.market.refreshLive(Date.now());
    expect(mock.calls.length).toBe(1);
  });
});
