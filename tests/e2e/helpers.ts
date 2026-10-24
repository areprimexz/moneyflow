import { expect, type APIRequestContext, type Page } from "@playwright/test";

export async function resetAccount(request: APIRequestContext, opts: { initialBalance?: string; startingState?: "cash" | "demo" } = {}) {
  const res = await request.post("/api/account/reset", {
    data: { confirm: "RESET", initialBalance: opts.initialBalance ?? "9999", startingState: opts.startingState ?? "cash", resetPreferences: true, resetMarket: true },
  });
  expect(res.ok()).toBeTruthy();
}

/** Parse "$12,345.67" (or "-$1.00") into a number. */
export function usd(text: string): number {
  const m = text.replace(/\s/g, "").match(/(-?)\$([\d,]+\.\d+)/);
  if (!m) throw new Error(`No USD amount in "${text}"`);
  return Number(`${m[1]}${m[2]!.replace(/,/g, "")}`);
}

export async function portfolioTotal(page: Page): Promise<number> {
  const el = page.getByTestId("portfolio-total");
  await expect(el).toBeVisible();
  return usd((await el.textContent()) ?? "");
}

export async function apiAccount(request: APIRequestContext) {
  const res = await request.get("/api/account");
  return (await res.json()) as { cash: { spot: string; total: string; reserved: string }; positions: { symbol: string; quantity: string }[]; totals: { transactionCount: number } };
}
