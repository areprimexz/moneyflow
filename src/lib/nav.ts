import { ArrowLeftRight, BarChart3, LayoutDashboard, LineChart, PieChart, ReceiptText, Settings, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, description: "Portfolio dashboard" },
  { to: "/markets", label: "Markets", icon: BarChart3, description: "Prices, watchlist and asset details" },
  { to: "/trade", label: "Trade", icon: ArrowLeftRight, description: "Trading terminal" },
  { to: "/portfolio", label: "Portfolio", icon: PieChart, description: "Holdings, cost basis and P/L" },
  { to: "/wallet", label: "Wallet", icon: Wallet, description: "Spot and Vault balances" },
  { to: "/transactions", label: "Transactions", icon: ReceiptText, description: "Ledger history" },
  { to: "/analytics", label: "Analytics", icon: LineChart, description: "Performance analysis" },
  { to: "/settings", label: "Settings", icon: Settings, description: "Account control center" },
];

export function navForPath(path: string): NavItem {
  if (path === "/") return NAV[0]!;
  return NAV.find((n) => n.to !== "/" && path.startsWith(n.to)) ?? NAV[0]!;
}
