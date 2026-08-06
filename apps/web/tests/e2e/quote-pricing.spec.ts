import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { chooseOption, selectByName } from "./select";

/**
 * El segmento ya no descuenta nada (es solo una etiqueta), asi que lo unico
 * que queda por defender aqui es que el total del formulario sea el que se
 * guarda: la vista previa y el backend corren el mismo PricingService.
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
  await chooseOption(page, selectByName(page, "customerId"), { label: customerName });
  await chooseOption(page, page.getByTestId("product-select").first(), { index: 1 });
}

test("form total matches the saved quote detail (QUO-03)", async ({ page, request }) => {
  await waitForBackend(request);
  await loginAsAdmin(page);
  await startQuoteFor(page, "La Economia");

  const formTotal = page.getByTestId("quote-total");
  await expect(formTotal).not.toHaveText("—");
  await expect(formTotal).not.toHaveText("Calculando...");
  const shownTotal = (await formTotal.textContent())?.trim();
  expect(shownTotal).not.toMatch(/NaN/);

  await page.getByRole("button", { name: "Guardar cotización" }).click();
  await expect(page).toHaveURL(/\/quotes\/[a-z0-9-]+$/);

  // The detail formats COP with no decimals, so compare the integer amounts.
  const digits = (text: string) => text.replace(/[^\d]/g, "");
  const detailTotal = await page.getByText(/Total cotizado/).locator("..").textContent();
  expect(digits(detailTotal ?? "")).toContain(digits(shownTotal ?? ""));
});
