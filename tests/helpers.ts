import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFlux, type Flux } from "../server/flux";

export const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

export class FakeClock {
  t: number;
  constructor(t = T0) {
    this.t = t;
  }
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}

export function makeFlux(opts: { clock?: FakeClock; dbPath?: string; initialBalance?: string } = {}): Flux & { clock: FakeClock } {
  const clock = opts.clock ?? new FakeClock();
  const flux = createFlux({ dbPath: opts.dbPath ?? ":memory:", now: clock.now, provider: null, initialBalance: opts.initialBalance });
  return Object.assign(flux, { clock });
}

export function tempDbPath(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "flux-test-"));
  return { path: join(dir, "flux.db"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

let n = 0;
export function cid(): string {
  n += 1;
  return `client-order-${n.toString().padStart(6, "0")}`;
}
