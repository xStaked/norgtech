import { expect, test } from "@playwright/test";

test("an authenticated user can create a customer", async ({ page, request }) => {
  // Wait for backend to be ready
  let backendReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await request.get("http://localhost:3001/health");
      if (res.ok()) {
        backendReady = true;
        break;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(backendReady, "Backend health check failed").toBe(true);

  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.local");
  await page.getByLabel("Contraseña").fill("Admin123*");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/customers/new");

  await page.locator('select[name="segmentId"]').selectOption({ index: 1 });
  await page.getByLabel("Razon social").fill("Agropecuaria Norte SAS");
  await page.getByLabel("Nombre comercial").fill("Agro Norte");
  await page.locator('input[name="contactFullName"]').fill("Carlos Perez");

  await page.getByRole("button", { name: "Guardar cliente" }).click();

  await page.waitForURL(/\/customers\/[a-z0-9_-]+$/i, { timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Agro Norte" })).toBeVisible();
});

test("customer detail shows 360 history sections", async ({ page, request }) => {
  // Wait for backend to be ready
  let backendReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await request.get("http://localhost:3001/health");
      if (res.ok()) {
        backendReady = true;
        break;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(backendReady, "Backend health check failed").toBe(true);

  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.local");
  await page.getByLabel("Contraseña").fill("Admin123*");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);

  // Create a new customer to view its detail
  await page.goto("/customers/new");
  await page.locator('select[name="segmentId"]').selectOption({ index: 1 });
  await page.getByLabel("Razon social").fill("Historial 360 SAS");
  await page.getByLabel("Nombre comercial").fill("Historial 360");
  await page.locator('input[name="contactFullName"]').fill("Luis Gomez");
  await page.getByRole("button", { name: "Guardar cliente" }).click();

  await page.waitForURL(/\/customers\/[a-z0-9_-]+$/i, { timeout: 10000 });

  // Verify history section is visible
  await expect(page.getByRole("heading", { name: "Historial 360" })).toBeVisible();

  // Verify at least one tab is visible
  await expect(page.getByRole("tab", { name: /Oportunidades/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Visitas/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Seguimientos/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Cotizaciones/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Pedidos/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Facturaciones/ })).toBeVisible();

  // Verify quick action buttons are visible
  await expect(page.getByRole("link", { name: "+ Visita" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Seguimiento" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Cotizacion" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Pedido" })).toBeVisible();
});
