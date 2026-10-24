import { createRequire } from "node:module";

/**
 * SQLite connection with a better-sqlite3-compatible surface (the subset Drizzle uses).
 *
 * Prefers the native `better-sqlite3` add-on. When it cannot be loaded — typically on
 * Windows when no prebuilt binary matched and no C++ toolchain is installed — it falls
 * back to Node's built-in `node:sqlite` (Node 22.13+), which needs no native build.
 */
export interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  raw(): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown };
}

type TxFn<T> = ((...args: unknown[]) => T) & { deferred: (...args: unknown[]) => T; immediate: (...args: unknown[]) => T; exclusive: (...args: unknown[]) => T };

export interface SqliteClient {
  readonly driver: "better-sqlite3" | "node:sqlite";
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(statement: string): void;
  transaction<T>(fn: (...args: unknown[]) => T): TxFn<T>;
  close(): void;
}

export type SqliteDriverPreference = "auto" | "better-sqlite3" | "node";

const require = createRequire(import.meta.url);

interface NodeStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  setReturnArrays?: (enabled: boolean) => void;
}
interface NodeDatabase {
  prepare(sql: string): NodeStatement;
  exec(sql: string): void;
  close(): void;
}

class NodeSqliteClient implements SqliteClient {
  readonly driver = "node:sqlite" as const;
  private readonly db: NodeDatabase;

  constructor(path: string) {
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => NodeDatabase };
    this.db = new DatabaseSync(path);
  }

  prepare(sql: string): SqliteStatement {
    const stmt = this.db.prepare(sql);
    const db = this.db;
    return {
      run: (...p) => stmt.run(...p),
      all: (...p) => stmt.all(...p),
      get: (...p) => stmt.get(...p),
      raw: () => {
        const rawStmt = db.prepare(sql);
        if (typeof rawStmt.setReturnArrays === "function") {
          rawStmt.setReturnArrays(true);
          return { all: (...p) => rawStmt.all(...p), get: (...p) => rawStmt.get(...p) };
        }
        // Older Node: column order of row objects matches the select list.
        return {
          all: (...p) => rawStmt.all(...p).map((r) => Object.values(r as object)),
          get: (...p) => {
            const r = rawStmt.get(...p);
            return r === undefined ? undefined : Object.values(r as object);
          },
        };
      },
    };
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  pragma(statement: string) {
    this.db.exec(`PRAGMA ${statement}`);
  }

  transaction<T>(fn: (...args: unknown[]) => T): TxFn<T> {
    const run =
      (mode: string) =>
      (...args: unknown[]): T => {
        this.db.exec(`BEGIN ${mode}`);
        try {
          const result = fn(...args);
          this.db.exec("COMMIT");
          return result;
        } catch (e) {
          try {
            this.db.exec("ROLLBACK");
          } catch {
            /* already rolled back by SQLite */
          }
          throw e;
        }
      };
    const tx = run("DEFERRED") as TxFn<T>;
    tx.deferred = tx;
    tx.immediate = run("IMMEDIATE");
    tx.exclusive = run("EXCLUSIVE");
    return tx;
  }

  close() {
    this.db.close();
  }
}

function openBetterSqlite(path: string): SqliteClient {
  const Database = require("better-sqlite3") as new (path: string) => {
    prepare(sql: string): SqliteStatement;
    exec(sql: string): void;
    pragma(s: string): unknown;
    transaction<T>(fn: (...args: unknown[]) => T): TxFn<T>;
    close(): void;
  };
  const db = new Database(path);
  return {
    driver: "better-sqlite3",
    prepare: (sql) => db.prepare(sql),
    exec: (sql) => db.exec(sql),
    pragma: (s) => void db.pragma(s),
    transaction: (fn) => db.transaction(fn),
    close: () => db.close(),
  };
}

export class DatabaseDriverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseDriverError";
  }
}

function reason(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.split("\n")[0]!.slice(0, 240);
}

export function openSqlite(path: string, preference: SqliteDriverPreference = "auto"): SqliteClient {
  if (preference === "node") return new NodeSqliteClient(path);
  try {
    return openBetterSqlite(path);
  } catch (nativeError) {
    if (preference === "better-sqlite3") throw nativeError;
    try {
      const client = new NodeSqliteClient(path);
      console.warn(`[db] better-sqlite3 is unavailable (${reason(nativeError)}); using Node's built-in node:sqlite instead.`);
      return client;
    } catch (builtinError) {
      throw new DatabaseDriverError(
        `Could not open the SQLite database. The better-sqlite3 add-on failed to load (${reason(nativeError)}) and Node's built-in SQLite is not available on Node ${process.version} (${reason(builtinError)}). Install Node.js 22 LTS or newer, then run "npm install" again.`,
      );
    }
  }
}
