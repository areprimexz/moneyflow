import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { BetterSQLiteSession } from "drizzle-orm/better-sqlite3/session";
import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm/relations";
import { BaseSQLiteDatabase, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";
import { openSqlite, type SqliteClient, type SqliteDriverPreference } from "./sqlite";

export type DB = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  db: DB;
  sqlite: SqliteClient;
  close(): void;
}

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Build the Drizzle database on top of our SQLite client. Constructed directly (rather than
 * via `drizzle()` from "drizzle-orm/better-sqlite3") so the native add-on is never imported
 * when the built-in node:sqlite fallback is in use.
 */
function createDrizzle(client: SqliteClient): DB {
  const dialect = new SQLiteSyncDialect();
  const tables = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
  const relational = { fullSchema: schema, schema: tables.tables, tableNamesMap: tables.tableNamesMap };
  // The client implements the better-sqlite3 surface the session uses.
  const session = new BetterSQLiteSession(client as never, dialect, relational, {});
  return new BaseSQLiteDatabase("sync", dialect, session, relational) as unknown as DB;
}

/** Open (and migrate) a SQLite database. Use ":memory:" for tests. */
export function openDatabase(path: string, driver: SqliteDriverPreference = (process.env.FLUX_SQLITE_DRIVER as SqliteDriverPreference) || "auto"): DatabaseHandle {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = openSqlite(path, driver);
  if (path !== ":memory:") sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = createDrizzle(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, sqlite, close: () => sqlite.close() };
}
