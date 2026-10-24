import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/domain/PageSkeleton";

const Overview = lazy(() => import("@/pages/Overview"));
const Markets = lazy(() => import("@/pages/Markets"));
const MarketDetail = lazy(() => import("@/pages/MarketDetail"));
const Trade = lazy(() => import("@/pages/Trade"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));
const PortfolioAsset = lazy(() => import("@/pages/PortfolioAsset"));
const Wallet = lazy(() => import("@/pages/Wallet"));
const WalletAsset = lazy(() => import("@/pages/WalletAsset"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Page el={<Overview />} />} />
        <Route path="markets" element={<Page el={<Markets />} />} />
        <Route path="markets/:pair" element={<Page el={<MarketDetail />} />} />
        <Route path="trade" element={<Page el={<Trade />} />} />
        <Route path="trade/:pair" element={<Page el={<Trade />} />} />
        <Route path="portfolio" element={<Page el={<Portfolio />} />} />
        <Route path="portfolio/:symbol" element={<Page el={<PortfolioAsset />} />} />
        <Route path="wallet" element={<Page el={<Wallet />} />} />
        <Route path="wallet/:symbol" element={<Page el={<WalletAsset />} />} />
        <Route path="transactions" element={<Page el={<Transactions />} />} />
        <Route path="transactions/:id" element={<Page el={<Transactions />} />} />
        <Route path="analytics" element={<Page el={<Analytics />} />} />
        <Route path="settings" element={<Page el={<Settings />} />} />
        <Route path="*" element={<Page el={<NotFound />} />} />
      </Route>
    </Routes>
  );
}

function Page({ el }: { el: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{el}</Suspense>;
}
