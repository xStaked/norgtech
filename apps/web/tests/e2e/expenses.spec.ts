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

test("commercial expenses page is available and shows create action", async ({ page, request }) => {
  await waitForBackend(request);
  await login(page, "comercial@norgtech.com", "Comercial123!");

  await page.goto("/expenses");

  await expect(page.getByRole("heading", { name: "Gastos comerciales" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo gasto" })).toBeVisible();
  await expect(page.getByText("Almuerzo con cliente en visita comercial")).toBeVisible();
});

test("facturacion can see export actions", async ({ page, request }) => {
  await waitForBackend(request);
  await login(page, "facturacion@norgtech.com", "Facturacion123!");

  await page.goto("/expenses");

  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "XLSX" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo gasto" })).toHaveCount(0);
});
