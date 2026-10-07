import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { expect, test, type Page } from "@playwright/test";

const admin = { id: "user-admin", name: "Admin E2E", email: "admin@norgtech.local", role: "administrador" };

const quote = {
  id: "quote-1",
  status: "abierta",
  subtotal: 100,
  total: 105,
  currencySnapshot: "USD",
  notes: null,
  validUntil: null,
  customer: { id: "customer-usd", displayName: "Cliente USD" },
  opportunity: null,
  createdAt: new Date().toISOString(),
  items: [
    {
      id: "qi-1",
      productSnapshotName: "Producto de prueba",
      productSnapshotSku: "SKU-001",
      unit: "frasco",
      quantity: 2,
      unitPrice: 50,
      originalUnitPrice: 50,
      discountPercent: 0,
      subtotal: 100,
      notes: null,
      priceSource: "special_price_list",
      priceListNameSnapshot: "Especial VIOS",
      currencySnapshot: "USD",
    },
  ],
};

const order = {
  id: "order-1",
  orderNumber: "NT-001",
  status: "recibido",
  subtotal: 100,
  total: 105,
  currencySnapshot: "USD",
  notes: null,
  purchaseOrderNumber: null,
  orderDate: new Date().toISOString(),
  customerNameSnapshot: "Cliente USD",
  customerNitSnapshot: null,
  billingCompanyNameSnapshot: "Norgtech",
  company: { name: "Norgtech", prefix: "NOR" },
  branchNameSnapshot: null,
  dispatchAddressSnapshot: null,
  requesterName: null,
  requesterEmail: null,
  requesterRole: null,
  requesterPhone: null,
  approvedQuoteConsecutive: null,
  deliveryInstructions: null,
  receiverName: null,
  receiverEmail: null,
  receiverPhone: null,
  receiverRole: null,
  invoiceFilingPlace: null,
  approvalStatus: null,
  approvalReason: null,
  approvalName: null,
  reviewDate: null,
  preparedByName: "Admin",
  zone: null,
  preparedByRole: null,
  requestedDeliveryDate: null,
  committedDeliveryDate: null,
  dispatchDate: null,
  carrierName: null,
  trackingNumber: null,
  trackingUrl: null,
  deliveryDate: null,
  deliveredToName: null,
  deliveryConfirmationNotes: null,
  logisticsNotes: null,
  customer: { id: "customer-usd", displayName: "Cliente USD" },
  opportunity: null,
  sourceQuote: { id: "quote-1" },
  items: [
    {
      id: "oi-1",
      productSnapshotName: "Producto de prueba",
      productSnapshotSku: "SKU-001",
      presentationSnapshot: "Bolsa x 500 g",
      customProductName: null,
      unit: "frasco",
      quantity: 2,
      unitPrice: 50,
      subtotal: 100,
      taxPercent: 5,
      taxAmount: 2.5,
      totalWithTax: 105,
      notes: null,
      priceSource: "special_price_list",
      priceListNameSnapshot: "Especial VIOS",
      currencySnapshot: "USD",
    },
  ],
  billingRequests: [],
  assignedLogisticsUser: null,
  seller: { id: "user-admin", name: "Admin E2E" },
  createdAt: new Date().toISOString(),
};

const invoice = {
  id: "inv-1",
  invoiceNumber: "NOR-001",
  customer: { id: "customer-usd", displayName: "Cliente USD", taxId: null },
  order: { id: "order-1", orderNumber: "NT-001" },
  issueDate: new Date().toISOString(),
  dueDate: new Date(Date.now() + 86400000).toISOString(),
  subtotal: 100,
  taxAmount: 5,
  totalAmount: 105,
  totalPaid: 5,
  creditNoteTotal: 0,
  status: "emitida",
  notes: null,
  payments: [],
  currencySnapshot: "USD",
};

function send(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
}

async function handleMock(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost:3001");
  if (url.pathname === "/auth/me") return send(res, 200, admin);
  if (url.pathname === "/quotes/quote-1") return send(res, 200, quote);
  if (url.pathname === "/orders/order-1") return send(res, 200, order);
  if (url.pathname === "/invoices/inv-1") return send(res, 200, invoice);
  if (url.pathname === "/invoices") return send(res, 200, [invoice]);
  return send(res, 404, { message: `mock ${url.pathname}` });
}

const server = createServer((req, res) => {
  void handleMock(req, res);
});

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3001, "0.0.0.0", resolve);
  });
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function loginAs(page: Page) {
  const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ sub: admin.id, email: admin.email, role: admin.role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  await page.context().addCookies([{ name: "session_token", value: `${h}.${p}.t`, url: "http://localhost:3000" }]);
}

test("quote and order detail show price source in the customer currency", async ({ page }) => {
  await loginAs(page);
  await page.goto("/quotes/quote-1");
  await expect(page.getByText("Precio especial").first()).toBeVisible();
  await expect(page.getByText("Especial VIOS").first()).toBeVisible();
  await expect(page.getByText("USD").first()).toBeVisible();
  await page.goto("/orders/order-1");
  await expect(page.getByText("Precio especial").first()).toBeVisible();
  await expect(page.getByText("Especial VIOS").first()).toBeVisible();
});

test("invoice and debtors views format total paid and balance using invoice currency", async ({ page }) => {
  await loginAs(page);
  await page.goto("/invoices/inv-1");
  await expect(page.getByText("USD").first()).toBeVisible();
  await expect(page.getByText(/US\$/).first()).toBeVisible();
  await page.goto("/invoices");
  await expect(page.getByText("USD").first()).toBeVisible();
  await page.goto("/invoices/debtors");
  await expect(page.getByText("USD").first()).toBeVisible();
});
