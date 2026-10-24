# FLUX FINANCE

A cryptocurrency portfolio dashboard and **paper-trading** terminal. Every balance lives in an
internal, decimal-safe USD ledger: nothing is deposited, withdrawn or traded on a real exchange
or blockchain.

## Quick start

```bash
npm install          # Node.js 22.13 or newer
npm run dev          # web app + API on http://localhost:5173
```

The commands are identical in PowerShell, Command Prompt and macOS/Linux shells. In development
the API runs inside the Vite dev server, so there is a single port and no proxy.

Production build:

```bash
npm run build        # type-check + bundle the client into dist/
npm start            # serves API + client on http://localhost:4173
```

The SQLite database is created at `data/flux.db` on first start with a balance of **$0.00**;
add funds with **Wallet → Deposit** or **Settings → Cash & ledger adjustments**. Data survives
restarts; use **Settings → Reset** to start over.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Port of `npm start` (and `8787` for the API-only `npm run dev:api`) |
| `FLUX_DB_PATH` | `data/flux.db` | SQLite database file |
| `FLUX_INITIAL_BALANCE` | `0.00` | Opening balance for a brand-new database |
| `COINGECKO_API_KEY` | – | Optional key for live reference prices (server-side only) |
| `COINGECKO_API_PLAN` | `demo` | `demo` or `pro` (selects host and header) |
| `COINGECKO_BASE_URL` | provider default | Override the provider URL |
| `FLUX_SQLITE_DRIVER` | `auto` | `auto`, `better-sqlite3` or `node` (built-in `node:sqlite`) |

Setting a variable: PowerShell `$env:PORT=5000; npm start` · Command Prompt `set PORT=5000`
then `npm start` · macOS/Linux `PORT=5000 npm start`.

### Troubleshooting

* **"Cannot reach the FLUX FINANCE API server" / "The FLUX API failed to start"** — the
  message shows the reason; the terminal running `npm run dev` prints the full error.
* **SQLite driver** — the app prefers the native `better-sqlite3` add-on. If it cannot load
  (no prebuilt binary for your platform and no C++ build tools), it automatically falls back
  to Node's built-in `node:sqlite` and logs `driver: node:sqlite`. Both use the same
  `data/flux.db` file.
* **PowerShell "running scripts is disabled"** — run
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use Command Prompt.
* **End-to-end tests** need a browser: `npx playwright install chromium`.

## Checks

```bash
npm run typecheck    # tsc -b (client, server, shared, tests)
npm run lint         # ESLint
npm test             # Vitest: engine unit tests + service/API integration tests
npm run test:e2e     # Playwright: builds, starts an isolated server, drives the UI
```

## What is in the box

| Area | Highlights |
| --- | --- |
| Overview | Ledger-derived total value, cash, unrealized/realized P/L, configurable performance interval, total return, portfolio chart (1H–ALL), allocation, sortable holdings, recent activity, watchlist/top movers |
| Markets | Search, filters (watchlist, gainers, losers), sortable table, 7-day sparklines, asset detail pages with candlestick charts |
| Trade | Pair selector, candles + volume, intervals, market & limit orders, quantity ⇄ value entry, % of balance, fee preview, confirmation dialog, open orders / order history / trade history, simulated depth and trade tape |
| Portfolio | Cost basis, average entry, unrealized/realized P/L per asset, FIFO lot table, position history, closed positions |
| Wallet | Spot (trading) and Vault (holding) accounts, paper deposits / withdrawals / internal transfers with simulated network-fee estimates, network metadata |
| Transactions | Search, asset/type/date filters, sort, detail drawer with ledger entries, CSV export of the visible rows |
| Analytics | Period P/L, time-weighted return, daily P/L, cumulative and monthly returns, trading volume, fees, win/loss stats, best/worst asset, allocation |
| Settings | Initial balance & baseline (account restart), cash target and administrative credit/debit adjustments, market mode, controlled-market prices/24h change/volatility/movement rate/enabled markets/chart intervals, fees, preferences, reset workflow, paper-trading disclosure |

## Architecture

```
shared/   Pure TypeScript used by client and server
  decimal.ts, format.ts, validation.ts   decimal.js helpers, USD formatting, input parsing
  assets.ts                              asset catalogue + network metadata
  engine/                                fees, order planning, FIFO lots, portfolio valuation
  market/                                deterministic controlled-market engine
server/   Hono API on Node + SQLite (better-sqlite3 + Drizzle)
  db/                                    schema + migrations
  market/                                market data service, CoinGecko provider
  services/                              ledger, trading, account, portfolio/analytics, settings
src/      React 19 + Vite + Tailwind v4 client (TanStack Query, Radix, lightweight-charts)
tests/    unit/, integration/ (Vitest) and e2e/ (Playwright)
```

### Single source of truth

* **Balances** — USD cash and asset quantities (per Spot/Vault account) are the sum of
  `ledger_entries`. No balance is stored anywhere else.
* **Cost basis** — `lots` (acquisitions) minus `lot_consumptions` (disposals).
* **Transactions** — user-facing records that own the ledger entries they post. Every write
  runs in a single SQLite transaction and is rolled back if any balance would go negative.
* **Portfolio value** — derived on demand: cash + Σ quantity × current price, using one shared
  valuation function on client and server. History is reconstructed by replaying the ledger
  against the active price source.

### Accounting

* Money and quantities use `decimal.js`; USD is stored to the cent.
* Fee = gross × rate, rounded half-up to the cent. Market orders pay the taker rate (default
  0.10%); resting limit orders that fill later pay the maker rate (0.08%).
* **FIFO** cost basis. Buy fees are capitalised into the lot. Realized P/L of a sell =
  (gross − fee) − FIFO cost removed. Unrealized P/L = market value − remaining cost basis.
* Paper deposits of crypto open a lot at the market value at deposit time; withdrawals remove
  FIFO cost basis without realizing P/L.

### Orders

* Market orders execute at the server's reference price at processing time.
* Limit orders reserve cash (buy) or assets (sell) and rest until the price path crosses the
  limit; they then fill **at the limit price**, once, with the maker fee. A limit that is
  already marketable executes immediately at the current price.
* A client-generated `clientOrderId` makes submission idempotent: resubmitting never executes twice.
* A background matcher checks open orders every 2 seconds (and on every read), including
  catch-up after the server was offline.

### Market data

* **Controlled mode (default)** — a deterministic multi-scale random walk per asset. Prices are a
  pure function of time, so charts, valuations and execution always agree. Operators can set a
  price + 24h change (reshapes only the previous 48 h of synthetic history), volatility, movement
  rate (including pause) and halt markets. Volume, depth and trade prints are labelled simulated.
* **Live mode** — reference prices from CoinGecko, fetched by the server (never the browser),
  cached and polled every 30 s with rate-limit back-off. Data older than 3 minutes is marked
  stale and market orders pause; if the provider is unreachable the UI says so, shows
  controlled-market prices labelled as fallback, and trading pauses until prices load or you
  switch back to Controlled mode.

## Limitations

* Single local user, no authentication (the server keeps all state, so auth can be added).
* Live mode depends on the public CoinGecko API being reachable; candles in live mode are built
  from the provider's price points (5-minute granularity at best) and have no volume, depth or
  trade feed.
* No external wallet integration: the Wallet page never shows a connected wallet, address or
  on-chain confirmation.
