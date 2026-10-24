import { describe, expect, it } from "vitest";
import { formatCompactUsd, formatPct, formatPrice, formatQty, formatUsd } from "../../shared/format";

describe("USD formatting", () => {
  it.each([
    ["9999", "$9,999.00"],
    ["9999.99", "$9,999.99"],
    ["100000", "$100,000.00"],
    ["1000000", "$1,000,000.00"],
    ["10000000", "$10,000,000.00"],
    ["125430.5", "$125,430.50"],
    ["1250000", "$1,250,000.00"],
    ["0", "$0.00"],
    ["0.005", "$0.01"],
    ["-1234.5", "-$1,234.50"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatUsd(input)).toBe(expected);
  });

  it("formats exact decimals without float error", () => {
    expect(formatUsd("0.1").replace("$", "")).toBe("0.10");
    expect(formatUsd("999999999999.99")).toBe("$999,999,999,999.99");
  });

  it("signs P/L values", () => {
    expect(formatUsd("12.3", { signed: true })).toBe("+$12.30");
    expect(formatUsd("-12.3", { signed: true })).toBe("-$12.30");
    expect(formatUsd("0", { signed: true })).toBe("$0.00");
  });

  it("formats compact values", () => {
    expect(formatCompactUsd("1250000")).toBe("$1.25M");
    expect(formatCompactUsd("38200000000")).toBe("$38.20B");
  });

  it("formats prices with asset precision", () => {
    expect(formatPrice("0.21487", 5)).toBe("$0.21487");
    expect(formatPrice("112480.35", 2)).toBe("$112,480.35");
  });

  it("formats quantities and percentages", () => {
    expect(formatQty("0.0125", 6)).toBe("0.012500");
    expect(formatQty("0.0125", 6, { trim: true })).toBe("0.0125");
    expect(formatQty("1250", 0)).toBe("1,250");
    expect(formatPct("0.0214")).toBe("+2.14%");
    expect(formatPct("-0.0127")).toBe("-1.27%");
    expect(formatPct("0")).toBe("0.00%");
  });
});
