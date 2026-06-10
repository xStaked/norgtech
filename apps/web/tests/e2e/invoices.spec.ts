import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

async function waitForBackend(request: APIRequestContext) {
  let backendReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await request.get("http://localhost:3001/health");
      if (res.ok()) {
        backendReady = true;
        break;
      }
    } catch {
      // ignore transient startup errors
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(backendReady, "Backend health check failed").toBe(true);
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("invoices page is available and shows create action for control roles", async ({ page, request }) => {
  await waitForBackend(request);
  await login(page, "facturacion@norgtech.com", "Facturacion123!");

  await page.goto("/invoices");

  await expect(page.locator("main").getByRole("heading", { name: "Cartera" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nueva factura" })).toBeVisible();
});

test("comercial can see invoices list but not create", async ({ page, request }) => {
  await waitForBackend(request);
  await login(page, "comercial@norgtech.com", "Comercial123!");

  await page.goto("/invoices");

  await expect(page.locator("main").getByRole("heading", { name: "Cartera" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nueva factura" })).toHaveCount(0);
});

test("new invoice form is available", async ({ page, request }) => {
  await waitForBackend(request);
  await login(page, "facturacion@norgtech.com", "Facturacion123!");

  await page.goto("/invoices/new");

  await expect(page.locator("main").getByRole("heading", { name: "Nueva factura" })).toBeVisible();
  await expect(page.locator("input[name='customerId']")).toBeVisible();
  await expect(page.locator("input[name='subtotal']")).toBeVisible();
  await expect(page.locator("input[name='taxAmount']")).toBeVisible();
  await expect(page.locator("input[name='totalAmount']")).toBeVisible();
});
