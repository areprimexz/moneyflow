import { describe, expect, it } from "vitest";
import { parseDecimalInput, parseUsdInput } from "../../shared/validation";

describe("numeric input validation", () => {
  it.each(["9999", "9999.99", "100000", "1000000", "10000000", "$9,999.99", " 42 "])("accepts %s", (raw) => {
    expect(parseUsdInput(raw).ok).toBe(true);
  });

  it.each([
    ["", "required"],
    ["   ", "required"],
    ["-5", "negative"],
    ["abc", "valid number"],
    ["1e5", "valid number"],
    ["Infinity", "valid number"],
    ["NaN", "valid number"],
    ["12.345", "decimal"],
    ["0", "greater than zero"],
    ["2000000000000", "maximum"],
  ])("rejects %j", (raw, message) => {
    const r = parseUsdInput(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain(message.toLowerCase());
  });

  it("rejects non-finite numbers", () => {
    expect(parseDecimalInput(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(parseDecimalInput(Number.NaN).ok).toBe(false);
    expect(parseDecimalInput(null).ok).toBe(false);
  });

  it("allows zero when requested", () => {
    expect(parseUsdInput("0", { allowZero: true }).ok).toBe(true);
  });
});
