import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

/** Time-ordered unique identifier: 8 chars of millisecond time + 6 random chars. */
export function newId(prefix: string, now = Date.now()): string {
  let t = now;
  let time = "";
  for (let i = 0; i < 8; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(6);
  let rand = "";
  for (const b of bytes) rand += ALPHABET[b % 32];
  return `${prefix}-${time}${rand}`;
}
