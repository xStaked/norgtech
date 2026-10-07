import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { chooseOption, selectByName } from "./select";

const users = {
  administrador: { id: "user-admin", name: "Admin E2E", email: "admin@norgtech.local", role: "administrador" },
  comercial: { id: "user-sales", name: "Comercial E2E", email: "comercial@norgtech.local", role: "comercial" },
} as const;

const customers = [
  { id: "customer-cop", displayName: "Cliente COP", currency: "COP", country: "Colombia", assignedToUserId: "user-sales" },
  { id: "customer-usd", displayName: "Cliente USD", currency: "USD", country: "Ecuador", assignedToUserId: "user-sales" },
];

const product = {
  id: "product-1",
  sku: "SKU-001",
  name: "Producto de prueba",
  unit: "frasco",
  presentations: [
    { id: "presentation-500g", empaque: "Bolsa x 500 g", form: "Polvo", dosage: null },
  ],
};

let generalLists: Array<any> = [];
let specialLists: Array<any> = [];
let nextGeneral = 1;
let nextSpecial = 1;

function resetMock() {
  generalLists = [
    {
      id: "general-source",
      name: "DIRECTOS",
      kind: "segmento",
      currency: "COP",
      country: "Colombia",
      active: true,
      status: "aprobada",
      customers: [],
      items: [],
      _count: { items: 0, customers: 0 },
    },
  ];
  specialLists = [];
  nextGeneral = 1;
  nextSpecial = 1;
}

function tokenUser(req: IncomingMessage): any {
  const auth = req.headers.authorization ?? "";
  const payload = auth.split(" ")[1]?.split(".")[1];
  if (!payload) return users.administrador;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const found = Object.values(users).find((u) => u.id === (parsed.sub ?? parsed.id));
    if (found) return found;
    return (users as any)[parsed.role] ?? users.administrador;
  } catch {
    return users.administrador;
  }
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c as any));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

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
  const user = tokenUser(req);
  const method = req.method ?? "GET";

  if (url.pathname === "/auth/me" && method === "GET") return send(res, 200, user);
  if (url.pathname === "/price-lists" && method === "GET") {
    const rows = url.searchParams.get("includeInactive") === "true" ? generalLists : generalLists.filter((l) => l.active);
    return send(res, 200, rows);
  }
  if (url.pathname === "/customers" && method === "GET") return send(res, 200, customers);
  if (url.pathname === "/products" && method === "GET") return send(res, 200, [product]);
  if (url.pathname === "/special-price-lists" && method === "GET") {
    const rows = user.role === "comercial" ? specialLists.filter((l) => l.ownerUserId === user.id) : specialLists;
    return send(res, 200, rows);
  }
  if (url.pathname === "/price-lists" && method === "POST") {
    const body = await readJson(req);
    const list = {
      id: `general-${nextGeneral++}`,
      name: String(body.name),
      kind: String(body.kind),
      currency: String(body.currency),
      country: body.country ?? "Colombia",
      active: false,
      status: "borrador",
      customers: [],
      items: [],
      _count: { items: 0, customers: 0 },
    };
    generalLists.push(list);
    return send(res, 201, list);
  }
  const detail = url.pathname.match(/^\/price-lists\/([^/]+)$/);
  if (detail && method === "GET") {
    const list = generalLists.find((l) => l.id === detail[1]);
    return send(res, list ? 200 : 404, list ?? { message: "no" });
  }
  if (detail && method === "PATCH") {
    const list = generalLists.find((l) => l.id === detail[1]);
    if (!list) return send(res, 404, { message: "no" });
    Object.assign(list, await readJson(req));
    if (list.active) list.status = "aprobada";
    return send(res, 200, list);
  }
  const clone = url.pathname.match(/^\/price-lists\/([^/]+)\/clone$/);
  if (clone && method === "POST") {
    const src = generalLists.find((l) => l.id === clone[1]);
    if (!src) return send(res, 404, { message: "no" });
    const body = await readJson(req);
    const copy = { ...src, id: `general-${nextGeneral++}`, name: String(body.name), active: false, status: "borrador", customers: [], items: [...src.items] };
    generalLists.push(copy);
    return send(res, 201, copy);
  }
  const itemRoute = url.pathname.match(/^\/price-lists\/([^/]+)\/items$/);
  if (itemRoute && method === "PUT") {
    const list = generalLists.find((l) => l.id === itemRoute[1]);
    if (!list) return send(res, 404, { message: "no" });
    const body = await readJson(req);
    const pres = product.presentations.find((p) => p.id === body.presentationId);
    const row = {
      id: `item-${body.presentationId}`,
      presentationId: body.presentationId,
      priceSinIva: body.priceSinIva ?? null,
      priceConIva: body.priceConIva ?? null,
      taxPercent: body.taxPercent ?? null,
      priceSinIva2: null,
      priceConIva2: null,
      priceSinIva3: null,
      priceConIva3: null,
      empaque: pres?.empaque ?? "",
      form: pres?.form ?? null,
      dosage: null,
      product: { id: product.id, sku: product.sku, name: product.name, unit: product.unit },
    };
    const idx = list.items.findIndex((i: any) => i.presentationId === body.presentationId);
    if (idx >= 0) list.items[idx] = row;
    else list.items.push(row);
    return send(res, 200, row);
  }
  if (url.pathname === "/special-price-lists" && method === "POST") {
    const body = await readJson(req);
    const id = `special-${nextSpecial++}`;
    const revision = {
      id: `rev-${id}-1`,
      revision: 1,
      status: "en_revision",
      active: false,
      items: (body.items as any[]).map((i) => ({
        ...i,
        customer: customers.find((c) => c.id === i.customerId),
        presentation: product.presentations.find((p) => p.id === i.presentationId),
      })),
      customers: [...new Set((body.items as any[]).map((i) => i.customerId))].map((cid) => customers.find((c) => c.id === cid)),
    };
    const list = { id, name: String(body.name), ownerUserId: user.id, active: true, revisions: [revision] };
    specialLists.push(list);
    return send(res, 201, list);
  }
  const sdetail = url.pathname.match(/^\/special-price-lists\/([^/]+)$/);
  if (sdetail && method === "GET") {
    const list = specialLists.find((l) => l.id === sdetail[1]);
    return send(res, list ? 200 : 404, list ?? { message: "no" });
  }
  const sapproval = url.pathname.match(/^\/special-price-lists\/([^/]+)\/revisions\/([^/]+)\/approval$/);
  if (sapproval && method === "PATCH") {
    const list = specialLists.find((l) => l.id === sapproval[1]);
    const rev = list?.revisions.find((r: any) => r.id === sapproval[2]);
    if (!list || !rev) return send(res, 404, { message: "no" });
    const body = await readJson(req);
    rev.status = body.action === "aprobar" ? "aprobada" : "rechazada";
    rev.active = body.action === "aprobar";
    return send(res, 200, rev);
  }
  const srev = url.pathname.match(/^\/special-price-lists\/([^/]+)\/revisions\/([^/]+)$/);
  if (srev && method === "PATCH") {
    const list = specialLists.find((l) => l.id === srev[1]);
    const rev = list?.revisions.find((r: any) => r.id === srev[2]);
    if (!list || !rev) return send(res, 404, { message: "no" });
    const body = await readJson(req);
    rev.items = (body.items as any[]).map((i) => ({
      ...i,
      customer: customers.find((c) => c.id === i.customerId),
      presentation: product.presentations.find((p) => p.id === i.presentationId),
    }));
    return send(res, 200, rev);
  }
  const ssubmit = url.pathname.match(/^\/special-price-lists\/([^/]+)\/revisions\/([^/]+)\/submit$/);
  if (ssubmit && method === "POST") {
    const list = specialLists.find((l) => l.id === ssubmit[1]);
    const rev = list?.revisions.find((r: any) => r.id === ssubmit[2]);
    if (!list || !rev) return send(res, 404, { message: "no" });
    rev.status = "en_revision";
    rev.active = false;
    return send(res, 201, rev);
  }
  return send(res, 404, { message: `mock ${method} ${url.pathname}` });
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
test.beforeEach(() => resetMock());

async function loginAs(page: Page, role: keyof typeof users) {
  const u = users[role];
  const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ sub: u.id, email: u.email, role: u.role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  await page.context().addCookies([{ name: "session_token", value: `${h}.${p}.t`, url: "http://localhost:3000" }]);
}

test("manager can create, price and deactivate a general list", async ({ page }) => {
  await loginAs(page, "administrador");
  await page.goto("/price-lists");
  await page.getByRole("link", { name: "Nueva lista" }).click();
  await expect(page.getByRole("heading", { name: "Nueva lista de precios" })).toBeVisible();
  await page.getByLabel("Nombre").fill("EXPORTACION ECUADOR");
  await chooseOption(page, selectByName(page, "kind"), { label: "Países" });
  await chooseOption(page, selectByName(page, "currency"), { label: "USD" });
  await page.getByLabel("País").fill("Ecuador");
  await page.getByRole("button", { name: "Guardar lista" }).click();
  await expect(page.getByRole("heading", { name: "EXPORTACION ECUADOR" })).toBeVisible();
  await page.getByRole("button", { name: "Agregar precio" }).click();
  await chooseOption(page, selectByName(page, "presentationId"), { index: 0 });
  await page.getByLabel("Precio sin IVA").fill("150");
  await page.getByRole("button", { name: "Guardar precio" }).click();
  await expect(page.getByText("150,00").first()).toBeVisible();
  await expect(page.getByText("Inactiva").first()).toBeVisible();
  await page.getByRole("button", { name: "Activar lista" }).click();
  await expect(page.getByText("Activa").first()).toBeVisible();
  await page.getByRole("button", { name: "Desactivar lista" }).click();
  await expect(page.getByText("Inactiva").first()).toBeVisible();
});

test("commercial submits customer-specific prices with inherited currency", async ({ page }) => {
  await loginAs(page, "comercial");
  await page.goto("/price-lists");
  await expect(page.getByRole("link", { name: "Subir lista especial" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nueva lista" })).toHaveCount(0);
  await page.getByRole("link", { name: "Subir lista especial" }).click();
  await expect(page.getByRole("heading", { name: "Nueva lista especial" })).toBeVisible();
  await page.getByLabel("Nombre de la lista").fill("Grupo VIOS especial");
  await chooseOption(page, selectByName(page, "items.0.customerId"), { index: 0 });
  await chooseOption(page, selectByName(page, "items.0.productId"), { label: "Producto de prueba" });
  await chooseOption(page, selectByName(page, "items.0.presentationId"), { index: 0 });
  await expect(page.getByTestId("currency-items.0")).toHaveText("COP");
  await page.getByLabel("Precio sin IVA").first().fill("12500");
  await page.getByRole("button", { name: "Agregar producto y cliente" }).click();
  await chooseOption(page, selectByName(page, "items.1.customerId"), { index: 1 });
  await chooseOption(page, selectByName(page, "items.1.productId"), { label: "Producto de prueba" });
  await chooseOption(page, selectByName(page, "items.1.presentationId"), { index: 0 });
  await expect(page.getByTestId("currency-items.1")).toHaveText("USD");
  await page.getByLabel("Precio sin IVA").nth(1).fill("25.50");
  await page.getByRole("button", { name: "Enviar a revisión" }).click();
  await expect(page.getByText("Grupo VIOS especial")).toBeVisible();
});

test("manager can edit and clone a general list", async ({ page }) => {
  await loginAs(page, "administrador");
  await page.goto("/price-lists/general-source");
  await page.getByRole("link", { name: "Editar lista" }).click();
  await expect(page.getByRole("heading", { name: "Editar lista" })).toBeVisible();
  await page.getByLabel("Nombre").fill("DIRECTOS 2026");
  await page.getByRole("button", { name: "Guardar lista" }).click();
  await expect(page.getByRole("heading", { name: "DIRECTOS 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Clonar" }).click();
  await page.getByLabel("Nombre de la copia").fill("DIRECTOS respaldo");
  await page.getByRole("button", { name: "Crear copia" }).click();
  await expect(page.getByRole("heading", { name: "DIRECTOS respaldo" })).toBeVisible();
});

test("manager reviews a special list from its detail", async ({ page }) => {
  await loginAs(page, "comercial");
  await page.goto("/price-lists/special/new");
  await page.getByLabel("Nombre de la lista").fill("Especial por aprobar");
  await chooseOption(page, selectByName(page, "items.0.customerId"), { index: 0 });
  await chooseOption(page, selectByName(page, "items.0.productId"), { label: "Producto de prueba" });
  await chooseOption(page, selectByName(page, "items.0.presentationId"), { index: 0 });
  await page.getByLabel("Precio sin IVA").first().fill("9000");
  await page.getByRole("button", { name: "Enviar a revisión" }).click();
  await expect(page.getByText("Especial por aprobar")).toBeVisible();

  await loginAs(page, "administrador");
  await page.goto("/price-lists");
  await page.getByRole("link", { name: "Especial por aprobar" }).click();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText("aprobada").first()).toBeVisible();
});

test("roles without write access are redirected from management routes", async ({ page }) => {
  await loginAs(page, "comercial");
  await page.goto("/price-lists/new");
  await expect(page).toHaveURL(/dashboard\?forbidden=1/);
  await page.goto("/price-lists/general-source/edit");
  await expect(page).toHaveURL(/dashboard\?forbidden=1/);
});

test("commercial corrects a rejected revision and resubmits it", async ({ page }) => {
  await loginAs(page, "comercial");
  await page.goto("/price-lists/special/new");
  await page.getByLabel("Nombre de la lista").fill("Especial corregible");
  await chooseOption(page, selectByName(page, "items.0.customerId"), { index: 0 });
  await chooseOption(page, selectByName(page, "items.0.productId"), { label: "Producto de prueba" });
  await chooseOption(page, selectByName(page, "items.0.presentationId"), { index: 0 });
  await page.getByLabel("Precio sin IVA").first().fill("8000");
  await page.getByRole("button", { name: "Enviar a revisión" }).click();
  await expect(page.getByText("Especial corregible")).toBeVisible();

  await loginAs(page, "administrador");
  await page.goto("/price-lists");
  await page.getByRole("link", { name: "Especial corregible" }).click();
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.getByText("rechazada").first()).toBeVisible();

  await loginAs(page, "comercial");
  await page.goto("/price-lists");
  await page.getByRole("link", { name: "Especial corregible" }).click();
  await page.getByRole("link", { name: "Corregir precios" }).click();
  await page.getByLabel("Precio sin IVA").first().fill("8500");
  await page.getByRole("button", { name: "Guardar y reenviar" }).click();
  await expect(page.getByText("en_revision").first()).toBeVisible();
});
