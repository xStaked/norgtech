import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

/**
 * The quote form must show the price the backend will actually save: the
 * segment discount is conditional on the customer meeting their goal.
 *
 * Seeded fixtures this relies on:
 *  - "La Economia" — segment Retail, 4%, minGoalAmount 0  -> always meets goal
 *  - "Indunorte"   — segment Oro,    8%, minGoalAmount 150M, 0 YTD -> never meets
 */

async function waitForBackend(request: APIRequestContext) {
  for (let i = 0; i < 20; i++) {
    try {
      if ((await request.get("http://localhost:3001/health")).ok()) return;
    } catch {
      // backend not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Backend health check failed");
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.com");
  await page.getByLabel("Contraseña").fill("Admin123!");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function startQuoteFor(page: Page, customerName: string) {
  await page.goto("/quotes/new");
  await page.locator('select[name="customerId"]').selectOption({ label: customerName });
  // The item's product select is the only one without a name attribute.
  await page.locator("select:not([name])").first().selectOption({ index: 1 });
}

test("applies the segment discount when the customer meets the goal", async ({ page, request }) => {
  await waitForBackend(request);
  await loginAsAdmin(page);
  await startQuoteFor(page, "La Economia");

  // Retail = 4%, goal 0 -> met, so the discount is real and must be shown.
  await expect(page.getByText(/Descuento:\s*4\.00%/)).toBeVisible();
  await expect(page.getByText(/Descuento por segmento \(4\.00%\)/)).toBeVisible();
});

test("withholds the discount and explains why when the goal is not met", async ({
  page,
  request,
}) => {
  await waitForBackend(request);
  await loginAsAdmin(page);
  await startQuoteFor(page, "Indunorte");

  // Oro = 8%, but 0 YTD against a 150M goal. The form must not promise 8%.
  await expect(page.getByText(/Descuento:\s*0\.00%/)).toBeVisible();
  await expect(page.getByText(/faltan .* para cumplir la meta/i)).toBeVisible();
  await expect(page.getByText(/Descuento:\s*8\.00%/)).toHaveCount(0);
});

test("never renders NaN as a percentage (QUO-02)", async ({ page, request }) => {
  await waitForBackend(request);
  await loginAsAdmin(page);
  await startQuoteFor(page, "Indunorte");

  await expect(page.getByText(/Descuento:/)).toBeVisible();
  await expect(page.getByText(/NaN/)).toHaveCount(0);
});

test("form total matches the saved quote detail (QUO-03)", async ({ page, request }) => {
  await waitForBackend(request);
  await loginAsAdmin(page);
  await startQuoteFor(page, "La Economia");

  const formTotal = page.getByTestId("quote-total");
  await expect(formTotal).not.toHaveText("—");
  await expect(formTotal).not.toHaveText("Calculando...");
  const shownTotal = (await formTotal.textContent())?.trim();

  await page.getByRole("button", { name: "Guardar cotización" }).click();
  await expect(page).toHaveURL(/\/quotes\/[a-z0-9-]+$/);

  // The detail formats COP with no decimals, so compare the integer amounts.
  const digits = (text: string) => text.replace(/[^\d]/g, "");
  const detailTotal = await page.getByText(/Total cotizado/).locator("..").textContent();
  expect(digits(detailTotal ?? "")).toContain(digits(shownTotal ?? ""));
});
