import type Database from "better-sqlite3";
import type { DB } from "../db/client";
import type { MarketDataService } from "../market/marketData";
import type { SettingsStore } from "./settingsStore";

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

export interface Ctx {
  db: DB;
  sqlite: Database.Database;
  store: SettingsStore;
  market: MarketDataService;
  now: () => number;
}

export const ACCOUNT_ID = "main";
