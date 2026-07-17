import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

/**
 * El pedido se atribuye a un vendedor real (Order.sellerUserId), que es lo que
 * suman las metas del vendedor (GOAL-02). El formulario debe dejar elegirlo y
 * el detalle debe mostrar esa relacion — no `preparedByName` ("Elaboro"), que
 * es texto libre y un concepto distinto.
 *
 * Vendedores sembrados (activos, rol comercial/director_comercial):
 * "Carlos Mendoza", "Sergio Romero", "Laura Torres", "sebastian".
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

const SELLER = "Laura Torres";

test("el formulario ofrece un selector de Vendedor con vendedores reales", async ({
  page,
  request,
}) => {
  await waitForBackend(request);
  await loginAsAdmin(page);
  await page.goto("/orders/new");

  const sellerSelect = page.locator('select[name="sellerUserId"]');
  await expect(sellerSelect).toBeVisible();

  // Se puebla desde GET /users/sellers, asi que las opciones tardan un tick.
  await expect(sellerSelect.locator("option")).not.toHaveCount(1);
  await expect(sellerSelect.locator("option").first()).toHaveText(/Automatico/);
  await expect(sellerSelect.locator(`option:text-is("${SELLER}")`)).toHaveCount(1);
});

test("el detalle muestra el vendedor elegido en el formulario", async ({ page, request }) => {
  await waitForBackend(request);
  await loginAsAdmin(page);
  await page.goto("/orders/new");

  // CompanySelect tambien se puebla por fetch y, al ser required, no tiene
  // opcion placeholder: la primera opcion ya es una empresa real.
  const companySelect = page.locator('select[name="companyId"]');
  await expect(companySelect.locator("option").first()).toBeAttached();
  await companySelect.selectOption({ index: 0 });
  await page.locator('select[name="customerId"]').selectOption({ label: "La Economia" });

  const sellerSelect = page.locator('select[name="sellerUserId"]');
  await expect(sellerSelect.locator(`option:text-is("${SELLER}")`)).toHaveCount(1);
  await sellerSelect.selectOption({ label: SELLER });

  // "Elaboro" es texto libre y NO debe ser lo que el detalle llame "Vendedor".
  await page.locator('input[name="preparedByName"]').fill("Documento redactado por otra persona");

  await page.getByTestId("product-select").first().selectOption({ index: 1 });

  await page.getByRole("button", { name: "Guardar pedido" }).click();
  await expect(page).toHaveURL(/\/orders\/[a-z0-9-]+$/);

  await expect(page.getByText(`Vendedor: ${SELLER}`)).toBeVisible();
  await expect(page.getByText(/Vendedor: Documento redactado/)).toHaveCount(0);
});
