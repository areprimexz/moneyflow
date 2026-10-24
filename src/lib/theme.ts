import { useEffect, useState } from "react";

export interface ThemeColors {
  theme: "dark" | "light";
  text: string;
  muted: string;
  subtle: string;
  border: string;
  grid: string;
  card: string;
  up: string;
  down: string;
  accent: string;
  cash: string;
}

function read(): ThemeColors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    theme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
    text: v("--text"),
    muted: v("--muted"),
    subtle: v("--subtle"),
    border: v("--border"),
    grid: v("--chart-grid"),
    card: v("--card"),
    up: v("--up"),
    down: v("--down"),
    accent: v("--accent"),
    cash: v("--cash"),
  };
}

/** Resolved design tokens for canvas charts; updates when the theme attribute changes. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

export function applyTheme(theme: "dark" | "light", density: "comfortable" | "compact") {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== theme) root.setAttribute("data-theme", theme);
  if (root.getAttribute("data-density") !== density) root.setAttribute("data-density", density);
  try {
    localStorage.setItem("flux.theme", theme);
    localStorage.setItem("flux.density", density);
  } catch {
    /* storage unavailable: preference still applies for this session */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f6f9" : "#080b10");
}

/**
 * Allocation colours: fixed per entity (never by rank), drawn from a validated
 * categorical palette. Green/red slots are left out because gain/loss already uses
 * them. Remaining assets fold into a neutral "Other" group.
 */
const SERIES: Record<string, { dark: string; light: string }> = {
  BTC: { dark: "#d95926", light: "#eb6834" },
  ETH: { dark: "#3987e5", light: "#2a78d6" },
  SOL: { dark: "#199e70", light: "#1baf7a" },
  BNB: { dark: "#c98500", light: "#eda100" },
  XRP: { dark: "#9085e9", light: "#6250d6" },
  DOGE: { dark: "#d55181", light: "#e87ba4" },
};
export const OTHER_COLOR = { dark: "#4d5868", light: "#b8c1cd" };

export function allocationColor(symbol: string, theme: "dark" | "light"): string {
  if (symbol === "USD") return theme === "dark" ? "#2a3442" : "#dde3ea";
  return (SERIES[symbol] ?? OTHER_COLOR)[theme];
}

export function hasOwnAllocationColor(symbol: string): boolean {
  return symbol in SERIES || symbol === "USD";
}
