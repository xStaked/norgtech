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

async function getAdminToken(request: ReturnType<typeof test.fixtures>["request"]) {
  const res = await request.post("http://localhost:3001/auth/login", {
    data: { email: "admin@norgtech.com", password: "Admin123!" },
  });
  expect(res.ok()).toBe(true);
  const json = await res.json();
  return json.accessToken as string;
}

async function loginAsAdmin(page: ReturnType<typeof test.fixtures>["page"]) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@norgtech.com");
  await page.getByLabel("Contraseña").fill("Admin123!");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("create order and view logistics section", async ({ page, request }) => {
  await waitForBackend(request);
  const token = await getAdminToken(request);

  const segmentsRes = await request.get("http://localhost:3001/customer-segments", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const segments = await segmentsRes.json();
  const segmentId = segments[0]?.id;
  expect(segmentId).toBeTruthy();

  const sku = `PROD-${Date.now()}`;

  const customerRes = await request.post("http://localhost:3001/customers", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      legalName: "Cliente Prueba SAS",
      displayName: "Cliente Prueba",
      segmentId,
      contacts: [{ fullName: "Juan Perez", isPrimary: true }],
    },
  });
  expect(customerRes.ok()).toBe(true);
  const customer = await customerRes.json();

  const productRes = await request.post("http://localhost:3001/products", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      sku,
      name: "Producto de prueba",
      unit: "kg",
      basePrice: 50000,
    },
  });
  expect(productRes.ok()).toBe(true);
  const product = await productRes.json();

  await loginAsAdmin(page);

  await page.goto("/orders/new");
  await page.locator('select[name="customerId"]').selectOption(customer.id);
  await page.getByTestId("product-select").selectOption(product.id);
  await page.getByRole("button", { name: "Guardar pedido" }).click();

  await page.waitForURL(/\/orders\/[a-z0-9_-]+$/i, { timeout: 10000 });

  await expect(page.getByText("Recibido").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Logística" })).toBeVisible();

  await page.getByRole("button", { name: "Editar" }).click();
  await page.locator('input[type="date"]').fill("2026-05-15");
  await page.getByRole("button", { name: "Guardar" }).click();

  // Verify we returned to view mode (Editar button visible again)
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();
  // Verify the date is displayed (format may vary by timezone)
  await expect(page.getByText(/\d{1,2}[\/\-]\d{1,2}[\/\-]2026/)).toBeVisible();
});

test("advance order status and create billing request", async ({ page, request }) => {
  await waitForBackend(request);
  const token = await getAdminToken(request);

  const segmentsRes = await request.get("http://localhost:3001/customer-segments", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const segments = await segmentsRes.json();
  const segmentId = segments[0]?.id;
  expect(segmentId).toBeTruthy();

  const sku = `PROD-BILL-${Date.now()}`;

  const customerRes = await request.post("http://localhost:3001/customers", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      legalName: "Cliente Billing SAS",
      displayName: "Cliente Billing",
      segmentId,
      contacts: [{ fullName: "Ana Gomez", isPrimary: true }],
    },
  });
  expect(customerRes.ok()).toBe(true);
  const customer = await customerRes.json();

  const productRes = await request.post("http://localhost:3001/products", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      sku,
      name: "Producto billing",
      unit: "kg",
      basePrice: 50000,
    },
  });
  expect(productRes.ok()).toBe(true);
  const product = await productRes.json();

  await loginAsAdmin(page);

  await page.goto("/orders/new");
  await page.locator('select[name="customerId"]').selectOption(customer.id);
  await page.getByTestId("product-select").selectOption(product.id);
  await page.getByRole("button", { name: "Guardar pedido" }).click();
  await page.waitForURL(/\/orders\/[a-z0-9_-]+$/i, { timeout: 10000 });

  await page.getByRole("button", { name: "Avanzar a Orden de facturación" }).click();
  await expect(page.getByText("Orden de facturación").first()).toBeVisible();

  await page.getByRole("button", { name: "Avanzar a Facturado" }).click();
  await expect(page.getByText("Facturado").first()).toBeVisible();

  await page.getByRole("button", { name: "Avanzar a Despachado" }).click();
  await expect(page.getByText("Despachado").first()).toBeVisible();

  await page.getByRole("button", { name: "Avanzar a Entregado" }).click();
  await expect(page.getByText("Entregado").first()).toBeVisible();

  await page.getByRole("button", { name: "Generar solicitud de facturación" }).click();

  await expect(page.getByRole("heading", { name: "Solicitudes de facturación" })).toBeVisible();
});
