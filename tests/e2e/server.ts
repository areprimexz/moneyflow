/** Starts the production server against a fresh, isolated database for end-to-end tests. */
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const db = resolve(process.cwd(), "test-results/e2e.db");
for (const suffix of ["", "-wal", "-shm"]) rmSync(db + suffix, { force: true });
process.env.NODE_ENV = "production";
process.env.PORT = process.env.E2E_PORT ?? "4311";
process.env.FLUX_DB_PATH = db;
process.env.COINGECKO_BASE_URL = "http://127.0.0.1:9/unreachable";
await import("../../server/index.ts");
