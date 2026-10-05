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

test("ruta desconocida no redirige", () => {
  assert.equal(resolveRoleRedirect("/no-existe", "comercial"), null);
});
