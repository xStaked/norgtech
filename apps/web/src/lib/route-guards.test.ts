// node --test src/lib/route-guards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoleRedirect } from "./route-guards.ts";

test("comercial no entra a /users", () => {
  assert.equal(resolveRoleRedirect("/users", "comercial"), "/dashboard?forbidden=1");
});

test("/price-lists exige rol de la matriz", () => {
  assert.equal(resolveRoleRedirect("/price-lists", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/price-lists", "facturacion"), null);
});

// 2026-10-06: el modulo de comisiones se OCULTO del front (pantalla eliminada)
// mientras el negocio define la logica de liquidacion. La API sigue viva y
// protegida. El pin: la ruta ya no participa del guard (comportamiento de
// ruta desconocida).
test("/commissions ya no es ruta protegida del front", () => {
  assert.equal(resolveRoleRedirect("/commissions", "comercial"), null);
  assert.equal(resolveRoleRedirect("/commissions", "tecnico"), null);
});

test("ruta desconocida no redirige", () => {
  assert.equal(resolveRoleRedirect("/no-existe", "comercial"), null);
});

// ---------------------------------------------------------------------------
// Cierre fase 2 — barrido de pantallas sin restricción por URL (brechas
// C-WEB-1..13 de docs/seguridad-brechas.md): con sesión válida, escribir la
// URL entraba aunque canAccess dijera que no. Un caso por brecha: rol indebido
// -> /dashboard?forbidden=1, y un rol permitido -> null (para no sobre-cerrar).
// ---------------------------------------------------------------------------

// C-WEB-1: /visits solo adm, dir, com, tec (canAccess).
test("C-WEB-1 /visits bloquea fac y log", () => {
  assert.equal(resolveRoleRedirect("/visits", "facturacion"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/visits", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/visits", "tecnico"), null);
});

// C-WEB-2: /expenses permite a fac VER la lista, pero crear no (canCreate
// expense no incluye fac — D2 matiene el botón oculto; el URL también).
test("C-WEB-2 /expenses bloquea tec y log", () => {
  assert.equal(resolveRoleRedirect("/expenses", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/expenses", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/expenses", "facturacion"), null);
});

// D2: la web mantiene lo restrictivo en crear gastos (la API sí admite fac).
test("D2 /expenses/new bloquea fac (solo adm, dir, com crean)", () => {
  assert.equal(resolveRoleRedirect("/expenses/new", "facturacion"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/expenses/new", "comercial"), null);
});

// C-WEB-3: /follow-ups solo adm, dir, com, tec.
test("C-WEB-3 /follow-ups bloquea fac y log", () => {
  assert.equal(resolveRoleRedirect("/follow-ups", "facturacion"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/follow-ups", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/follow-ups", "tecnico"), null);
});

// C-WEB-4: /agenda agrega visits + follow-ups (mismo set de 4 roles).
test("C-WEB-4 /agenda bloquea fac y log", () => {
  assert.equal(resolveRoleRedirect("/agenda", "facturacion"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/agenda", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/agenda", "tecnico"), null);
});

// C-WEB-5: /nora (Magali) solo adm, dir, com, tec; fac registra sus gastos por
// WhatsApp sin pantalla Nora (D6 intencional).
test("C-WEB-5 /nora bloquea fac y log", () => {
  assert.equal(resolveRoleRedirect("/nora", "facturacion"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/nora", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/nora", "tecnico"), null);
});

// C-WEB-6 (D1 en web): /opportunities excluye tec; la API solo lo admite por
// los flujos de visitas/seguimientos (visits/page.tsx, follow-ups/page.tsx).
test("C-WEB-6 /opportunities bloquea tec, fac y log", () => {
  assert.equal(resolveRoleRedirect("/opportunities", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/opportunities", "facturacion"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/opportunities", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/opportunities", "comercial"), null);
});

// C-WEB-7: /quotes admite fac (ve, no crea).
test("C-WEB-7 /quotes bloquea tec y log", () => {
  assert.equal(resolveRoleRedirect("/quotes", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/quotes", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/quotes", "facturacion"), null);
});

// D5/C-WEB-8: /orders/review solo adm+fac (requiredRoles del nav, ruling 2 del
// ledger). El guard entra ANTES que el genérico de /orders.
test("C-WEB-8 /orders/review solo adm y fac", () => {
  assert.equal(resolveRoleRedirect("/orders/review", "director_comercial"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/orders/review", "comercial"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/orders/review", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/orders/review", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/orders/review", "facturacion"), null);
});

// C-WEB-9: /billing-requests solo adm, dir, fac.
test("C-WEB-9 /billing-requests bloquea com, tec y log", () => {
  assert.equal(resolveRoleRedirect("/billing-requests", "comercial"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/billing-requests", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/billing-requests", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/billing-requests", "facturacion"), null);
});

// C-WEB-10: /invoices admite com (ve, no crea); bloquea tec y log.
test("C-WEB-10 /invoices bloquea tec y log", () => {
  assert.equal(resolveRoleRedirect("/invoices", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/invoices", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/invoices", "comercial"), null);
});

// C-WEB-11: /returns admite com y fac.
test("C-WEB-11 /returns bloquea tec y log", () => {
  assert.equal(resolveRoleRedirect("/returns", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/returns", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/returns", "comercial"), null);
});

// C-WEB-12 (D3 en web): /products excluye fac y tec.
test("C-WEB-12 /products bloquea tec, fac y log", () => {
  assert.equal(resolveRoleRedirect("/products", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/products", "facturacion"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/products", "logistica"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/products", "comercial"), null);
});

// C-WEB-13: /orders admite fac y log; solo tec queda fuera.
test("C-WEB-13 /orders bloquea tec", () => {
  assert.equal(resolveRoleRedirect("/orders", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/orders", "logistica"), null);
});

// El genérico de /orders no puede pisar las entradas específicas.
test("específicas de /orders sobreviven al genérico", () => {
  // fac ve la lista pero no crea pedidos.
  assert.equal(resolveRoleRedirect("/orders/new", "facturacion"), "/dashboard?forbidden=1");
  // log crea pedidos.
  assert.equal(resolveRoleRedirect("/orders/new", "logistica"), null);
});

// El genérico de /invoices y el de /quotes tampoco pueden pisar los /new.
test("específicas de /invoices y /quotes sobreviven", () => {
  // com ve cartera pero no crea facturas.
  assert.equal(resolveRoleRedirect("/invoices/new", "comercial"), "/dashboard?forbidden=1");
  // fac ve cotizaciones pero no las crea.
  assert.equal(resolveRoleRedirect("/quotes/new", "facturacion"), "/dashboard?forbidden=1");
});
