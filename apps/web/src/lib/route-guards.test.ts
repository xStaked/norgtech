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

// Liquidacion de comisiones: direccion ve todas y un comercial entra a ver
// solo las suyas (el back le fuerza sellerUserId a su id, espejo de
// @Roles del controlador de comisiones). tecnico/facturacion/logistica no
// participan.
test("comercial entra a /commissions (ve solo las suyas)", () => {
  assert.equal(resolveRoleRedirect("/commissions", "comercial"), null);
  assert.equal(resolveRoleRedirect("/commissions", "administrador"), null);
  assert.equal(resolveRoleRedirect("/commissions", "director_comercial"), null);
});

test("/commissions bloquea roles sin liquidaciones", () => {
  assert.equal(resolveRoleRedirect("/commissions", "tecnico"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/commissions", "facturacion"), "/dashboard?forbidden=1");
  assert.equal(resolveRoleRedirect("/commissions", "logistica"), "/dashboard?forbidden=1");
});

test("ruta desconocida no redirige", () => {
  assert.equal(resolveRoleRedirect("/no-existe", "comercial"), null);
});
