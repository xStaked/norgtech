import { expect, test } from "@playwright/test";

async function waitForBackend(request: ReturnType<typeof test.fixtures>["request"]) {
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
}

async function loginAsAdmin(page: ReturnType<typeof test.fixtures>["page"]) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.local");
  await page.getByLabel("Contraseña").fill("Admin123*");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("generate report from completed visit and view it", async ({ page, request }) => {
  await waitForBackend(request);
  await loginAsAdmin(page);

  // Navigate to visits
  await page.goto("/visits");

  // Create a new visit first
  await page.getByRole("link", { name: "Nueva visita" }).click();
  await page.locator('select[name="customerId"]').selectOption({ index: 1 });
  await page.locator('input[name="scheduledAt"]').fill("2026-05-15T10:00");
  await page.getByRole("button", { name: "Guardar visita" }).click();

  // Wait for visit detail
  await page.waitForURL(/\/visits\/[a-z0-9_-]+$/i, { timeout: 10000 });

  // Complete the visit
  await page.getByRole("button", { name: "Marcar como completada" }).click();
  await page.waitForTimeout(500);

  // Refresh to see the completed state
  await page.reload();

  // Generate report
  await expect(page.getByRole("heading", { name: "Reporte ejecutivo" })).toBeVisible();
  await page.getByRole("button", { name: "Generar reporte ejecutivo" }).click();

  // Wait for navigation to report detail
  await page.waitForURL(/\/reports\/[a-z0-9_-]+$/i, { timeout: 10000 });

  // Verify report content sections
  await expect(page.getByRole("heading", { name: "1. Diagnóstico" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2. Problemas identificados" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3. Solución propuesta" })).toBeVisible();
});

test("view reports list", async ({ page, request }) => {
  await waitForBackend(request);
  await loginAsAdmin(page);

  await page.goto("/reports");

  // Verify page loads
  await expect(page.getByRole("heading", { name: "Reportes ejecutivos" })).toBeVisible();
  await expect(page.getByText("Reportes generados")).toBeVisible();
});
