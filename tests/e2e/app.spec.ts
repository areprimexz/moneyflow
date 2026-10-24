import { expect, test } from "@playwright/test";
import { apiAccount, portfolioTotal, resetAccount, usd } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetAccount(request);
});

test("opens on the dashboard with the $9,999.00 USD default balance", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.getByTestId("portfolio-total")).toHaveText("$9,999.00");
  await expect(page.getByText("USD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Your portfolio is all cash")).toBeVisible();
});

test("every main navigation destination works", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const destinations: [string, RegExp, string][] = [
    ["Markets", /\/markets$/, "Markets"],
    ["Trade", /\/trade\/BTC-USD$/, "Trade"],
    ["Portfolio", /\/portfolio$/, "Portfolio"],
    ["Wallet", /\/wallet$/, "Wallet"],
    ["Transactions", /\/transactions$/, "Transactions"],
    ["Analytics", /\/analytics$/, "Analytics"],
    ["Settings", /\/settings$/, "Settings"],
    ["Overview", /\/$/, "Overview"],
  ];
  for (const [label, url, heading] of destinations) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.goto("/does-not-exist");
  await expect(page.getByText("Page not found")).toBeVisible();
});

test("market buy and sell update cash, holdings and the ledger", async ({ page, request }) => {
  await page.goto("/trade/ETH-USD");
  await page.getByLabel("Quantity").fill("0.5");
  await expect(page.getByText("Total cost")).toBeVisible();
  await page.getByRole("button", { name: "Review buy ETH" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm market buy" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm buy" }).click();
  await expect(page.getByText(/Bought 0\.5 ETH/)).toBeVisible();
  await expect(dialog).toBeHidden();

  let account = await apiAccount(request);
  expect(account.positions.find((p) => p.symbol === "ETH")?.quantity).toBe("0.5");
  expect(Number(account.cash.spot)).toBeLessThan(9999);

  await page.getByRole("tab", { name: "Sell" }).click();
  await page.getByLabel("Quantity").fill("0.2");
  await page.getByRole("button", { name: "Review sell ETH" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm sell" }).click();
  await expect(page.getByText(/Sold 0\.2 ETH/)).toBeVisible();
  account = await apiAccount(request);
  expect(account.positions.find((p) => p.symbol === "ETH")?.quantity).toBe("0.3");
  expect(account.totals.transactionCount).toBe(3);

  // Trade history shows both fills.
  await page.getByRole("radio", { name: "Trade history" }).click();
  await expect(page.getByRole("cell", { name: "ETH/USD" })).toHaveCount(2);
});

test("overspending and invalid input are rejected inline", async ({ page }) => {
  await page.goto("/trade/BTC-USD");
  await page.getByLabel("Quantity").fill("5");
  await page.getByRole("button", { name: "Review buy BTC" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Insufficient funds" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByLabel("Quantity").fill("0.0000001");
  await expect(page.getByRole("alert").filter({ hasText: "at most 6 decimal places" })).toBeVisible();

  await page.getByRole("tab", { name: "Sell" }).click();
  await page.getByLabel("Quantity").fill("0.01");
  await page.getByRole("button", { name: "Review sell BTC" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Insufficient balance" })).toBeVisible();
});

test("limit orders rest until cancelled and never execute after cancellation", async ({ page, request }) => {
  await page.goto("/trade/SOL-USD");
  await page.getByRole("radio", { name: "Limit" }).click();
  await page.getByLabel("Limit price", { exact: true }).fill("100.00");
  await page.getByLabel("Quantity").fill("5");
  await page.getByRole("button", { name: "Review buy SOL" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Place limit order" }).click();
  await expect(page.getByText("Limit order placed")).toBeVisible();

  let account = await apiAccount(request);
  expect(account.cash.spot).toBe("9999");
  expect(Number(account.cash.reserved)).toBeGreaterThan(0);
  const row = page.getByRole("row").filter({ hasText: "SOL/USD" }).filter({ hasText: "Open" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Cancel order/ }).click();
  await expect(page.getByText("Order cancelled")).toBeVisible();
  account = await apiAccount(request);
  expect(account.cash.reserved).toBe("0");

  // Move the market far below the cancelled limit: nothing executes.
  const r = await request.put("/api/settings/market/assets/SOL", { data: { price: "50", change24h: "-40" } });
  expect(r.ok()).toBeTruthy();
  await page.waitForTimeout(2500);
  account = await apiAccount(request);
  expect(account.positions.find((p) => p.symbol === "SOL")).toBeUndefined();
  const orders = (await (await request.get("/api/orders")).json()).orders as { status: string }[];
  expect(orders.map((o) => o.status)).toEqual(["cancelled"]);
});

test("a resting limit order fills when the market reaches its price", async ({ page, request }) => {
  await page.goto("/trade/LINK-USD");
  await page.getByRole("radio", { name: "Limit" }).click();
  await page.getByLabel("Limit price", { exact: true }).fill("15.000");
  await page.getByLabel("Quantity").fill("10");
  await page.getByRole("button", { name: "Review buy LINK" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Place limit order" }).click();
  await expect(page.getByText("Limit order placed")).toBeVisible();
  expect((await apiAccount(request)).positions).toHaveLength(0);

  await request.put("/api/settings/market/assets/LINK", { data: { price: "14.500", change24h: "-25" } });
  await expect(page.getByText("Limit buy filled")).toBeVisible({ timeout: 15_000 });
  const account = await apiAccount(request);
  expect(account.positions.find((p) => p.symbol === "LINK")?.quantity).toBe("10");
  // Filled at the limit price (10 × 15.000 = 150.00) plus the 0.08% maker fee (0.12).
  expect(account.cash.spot).toBe("9848.88");
});

test("settings: administrative credit updates the ledger and dashboard total", async ({ page }) => {
  await page.goto("/settings#balance");
  const form = page.locator("form").filter({ hasText: "Administrative balance adjustment" });
  await form.getByLabel("Amount (USD)").fill("1000.50");
  await form.getByLabel("Reason").fill("Funding top-up");
  await form.getByRole("button", { name: "Review adjustment" }).click();
  await expect(form.getByText("Confirm the adjustment before posting.")).toBeVisible();
  await form.getByText("I confirm this adjustment should be posted to the paper ledger").click();
  await form.getByRole("button", { name: "Review adjustment" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Post credit" }).click();
  await expect(page.getByText("Balance adjustment posted")).toBeVisible();

  await page.goto("/");
  await expect(page.getByTestId("portfolio-total")).toHaveText("$10,999.50");
  await page.goto("/transactions");
  await expect(page.getByRole("row").filter({ hasText: "Balance adjustment" })).toBeVisible();
});

test("settings: the starting balance can be changed and reset requires typing RESET", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Initial account balance (USD)").fill("1000000");
  await expect(page.getByText("Displayed as $1,000,000.00")).toBeVisible();
  await page.getByRole("button", { name: "Apply & restart account" }).click();
  const dialog = page.getByRole("dialog", { name: "Restart paper account" });
  const restart = dialog.getByRole("button", { name: "Restart account" });
  await expect(restart).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill("reset");
  await expect(restart).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill("RESET");
  await expect(restart).toBeEnabled();
  await restart.click();
  await expect(page.getByText("Paper account restarted")).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("portfolio-total")).toHaveText("$1,000,000.00");

  // Invalid starting balances are rejected inline.
  await page.goto("/settings");
  await page.getByLabel("Initial account balance (USD)").fill("12.345");
  await page.getByLabel("Initial account balance (USD)").blur();
  await expect(page.getByText("Initial balance supports at most 2 decimal places.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply & restart account" })).toBeDisabled();
});

test("controlled market price changes revalue the portfolio", async ({ page, request }) => {
  await request.post("/api/orders", { data: { clientOrderId: "e2e-revalue-0001", symbol: "BTC", side: "buy", type: "market", quantity: "0.01" } });
  await request.put("/api/settings/market/assets/BTC", { data: { price: "100000.00", change24h: "0" } });
  await page.goto("/");
  const before = await portfolioTotal(page);
  await request.put("/api/settings/market/assets/BTC", { data: { price: "200000.00", change24h: "100" } });
  await page.reload();
  await expect.poll(async () => portfolioTotal(page)).toBeGreaterThan(before + 990);
});

test("data persists across reloads", async ({ page, request }) => {
  await request.post("/api/orders", { data: { clientOrderId: "e2e-persist-0001", symbol: "DOGE", side: "buy", type: "market", quantity: "1000" } });
  await page.goto("/portfolio");
  await expect(page.getByRole("row", { name: /Dogecoin position details/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row", { name: /Dogecoin position details/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Dogecoin position details/ })).toContainText("1,000");
});

test("wallet deposit and transfer post paper-ledger entries", async ({ page, request }) => {
  await page.goto("/wallet");
  await page.getByRole("button", { name: "Deposit" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Paper deposit" });
  await expect(dialog.getByText("Internal paper ledger only")).toBeVisible();
  await dialog.getByLabel("Amount").fill("250");
  await dialog.getByRole("button", { name: "Review" }).click();
  await dialog.getByRole("button", { name: "Confirm deposit" }).click();
  await expect(page.getByText("Paper deposit recorded")).toBeVisible();
  expect((await apiAccount(request)).cash.spot).toBe("10249");

  await page.getByRole("button", { name: "Transfer" }).first().click();
  const t = page.getByRole("dialog", { name: "Internal transfer" });
  await t.getByLabel("Amount").fill("49");
  await t.getByRole("button", { name: "Review" }).click();
  await t.getByRole("button", { name: "Confirm transfer" }).click();
  await expect(page.getByText("Internal transfer recorded")).toBeVisible();
  const account = await apiAccount(request);
  expect(account.cash.spot).toBe("10200");
  expect(account.cash.total).toBe("10249");
});

test("transactions can be filtered, inspected and exported to CSV", async ({ page, request }) => {
  await request.post("/api/orders", { data: { clientOrderId: "e2e-tx-0001", symbol: "ADA", side: "buy", type: "market", quantity: "100" } });
  await request.post("/api/wallet/deposit", { data: { asset: "USD", amount: "10", account: "spot", note: "e2e note" } });
  await page.goto("/transactions");
  await expect(page.getByText("3 of 3 transactions")).toBeVisible();
  await page.getByLabel("Type").selectOption("buy");
  await expect(page.getByText("1 of 3 transactions")).toBeVisible();
  await page.getByRole("row").filter({ hasText: "ADA" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Transaction details" });
  await expect(drawer.getByRole("heading", { name: "Ledger entries" })).toBeVisible();
  await expect(drawer.getByText("Settled on internal ledger (not a blockchain transaction)")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("textbox", { name: "Search" }).fill("e2e note");
  await expect(page.getByText("1 of 3 transactions")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  const path = await file.path();
  const { readFileSync } = await import("node:fs");
  const csv = readFileSync(path!, "utf8");
  expect(csv.split("\r\n")).toHaveLength(2);
  expect(csv).toContain("e2e note");
});

test("analytics and reset workflow are reachable from the analytics page", async ({ page, request }) => {
  await resetAccount(request, { startingState: "demo" });
  await page.goto("/analytics");
  await page.getByRole("radio", { name: "ALL" }).click();
  await expect(page.getByText("Win rate")).toBeVisible();
  await expect(page.getByText("Asset performance")).toBeVisible();
  await expect(page.getByText("Monthly performance")).toBeVisible();
  await page.getByRole("button", { name: "Reset paper account" }).click();
  await expect(page.getByRole("dialog", { name: "Restart paper account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restart account" })).toBeDisabled();
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  for (const path of ["/", "/markets", "/markets/BTC-USD", "/trade/BTC-USD", "/portfolio", "/wallet", "/transactions", "/analytics", "/settings"]) {
    test(`no horizontal overflow on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    });
  }

  test("drawer navigation works on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  });
});

test("USD values render with consistent formatting", async ({ page, request }) => {
  await resetAccount(request, { initialBalance: "10000000" });
  await page.goto("/");
  await expect(page.getByTestId("portfolio-total")).toHaveText("$10,000,000.00");
  expect(usd("$10,000,000.00")).toBe(10000000);
});
