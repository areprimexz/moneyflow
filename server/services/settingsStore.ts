import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { settings } from "../db/schema";

/** Typed JSON key/value store backed by the `settings` table, with a read-through cache. */
export class SettingsStore {
  private cache = new Map<string, unknown>();
  private readonly db: DB;
  constructor(db: DB) {
    this.db = db;
  }

  get<T>(key: string): T | undefined {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (!row) return undefined;
    const value = JSON.parse(row.value) as T;
    this.cache.set(key, value);
    return value;
  }

  set<T>(key: string, value: T, now = Date.now()): void {
    const json = JSON.stringify(value);
    this.db
      .insert(settings)
      .values({ key, value: json, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt: now } })
      .run();
    this.cache.set(key, value);
  }

  delete(key: string): void {
    this.db.delete(settings).where(eq(settings.key, key)).run();
    this.cache.delete(key);
  }

  /** Drop cached values (e.g. after a transaction rollback). */
  invalidate(): void {
    this.cache.clear();
  }
}
