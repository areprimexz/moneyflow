/**
 * Deterministic pseudo-random primitives for the controlled market engine.
 * Every value is a pure function of (seed, inputs), so charts and prices are
 * identical across renders, reloads and server restarts.
 */

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 32-bit integer hash of three integers (murmur3-style finaliser). */
export function hash3(a: number, b: number, c: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (c >>> 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Uniform value in [0, 1). */
export function rand01(a: number, b: number, c: number): number {
  return hash3(a, b, c) / 4294967296;
}

/** Uniform value in [-1, 1). */
export function randSigned(a: number, b: number, c: number): number {
  return rand01(a, b, c) * 2 - 1;
}

/** Base lattice spacing of the finest octave, in seconds. */
const BASE_SCALE_SECONDS = 4;
const OCTAVES = 26;
const SCALES = Array.from({ length: OCTAVES }, (_, k) => BASE_SCALE_SECONDS * 2 ** k);
const AMPLITUDES = SCALES.map((s) => Math.sqrt(s));

/**
 * Empirical normaliser so that `sigmaDaily * PATH_NORMALIZER * (N(t+1d) - N(t))`
 * has a standard deviation of roughly `sigmaDaily` (see tests/unit/market.test.ts).
 */
export const PATH_NORMALIZER = 1.2 / Math.sqrt(2 * 86400);

/**
 * Multi-octave piecewise-linear value noise with Brownian amplitude scaling
 * (amplitude ∝ √scale). Produces a random-walk-like path over seconds..years.
 */
export function fractalPath(seed: number, tSeconds: number): number {
  let total = 0;
  for (let k = 0; k < OCTAVES; k++) {
    const scale = SCALES[k]!;
    const x = tSeconds / scale;
    const i = Math.floor(x);
    const f = x - i;
    const v0 = randSigned(seed, k, i);
    const v1 = randSigned(seed, k, i + 1);
    total += AMPLITUDES[k]! * (v0 + (v1 - v0) * f);
  }
  return total;
}
