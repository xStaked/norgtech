import { expect, test } from "@playwright/test";

test("an authenticated user can create a customer", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.local");
  await page.getByLabel("Contraseña").fill("Admin123*");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/customers/new");

  await page.locator('select[name="segmentId"]').selectOption({ index: 0 });
  await page.getByLabel("Razon social").fill("Agropecuaria Norte SAS");
  await page.getByLabel("Nombre comercial").fill("Agro Norte");
  await page.locator('input[name="taxId"]').fill("900123456");
  await page.locator('input[name="contactFullName"]').fill("Carlos Perez");

  await page.getByRole("button", { name: "Guardar cliente" }).click();

  await expect(page.getByText("Agro Norte")).toBeVisible();
});
