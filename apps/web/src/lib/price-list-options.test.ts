// node --test src/lib/price-list-options.test.ts   (desde apps/web)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPriceListOptions,
  suggestPriceList,
  type PriceListRef,
} from "./catalog.ts";

const lists = [
  { id: "l1", name: "DIRECTOS", kind: "segmento", currency: "COP", country: "Colombia" },
  { id: "l2", name: "DISTRIBUIDORES", kind: "segmento", currency: "COP", country: "Colombia" },
  { id: "l3", name: "GUATEMALA", kind: "export", currency: "USD", country: "Guatemala" },
  {
    id: "l4",
    name: "CALASAN",
    kind: "cliente",
    currency: "COP",
    country: "Colombia",
    customers: [{ id: "c1", displayName: "Calasan S.A.S.", currency: "COP", country: "Colombia" }],
  },
  { id: "l5", name: "HUERFANA", kind: "cliente", currency: "COP", country: "Colombia", customers: [] },
] as PriceListRef[];

test("agrupa por tipo y muestra dueño, no hoja cruda", () => {
  const opts = buildPriceListOptions(lists);
  const byId = new Map(opts.map((o) => [o.value, o]));
  // Sin asignar siempre primero y sin grupo
  assert.equal(opts[0].value, "");
  assert.equal(opts[0].label, "Sin asignar — usa precio base");
  // Dueño real en vez de nombre de hoja
  assert.equal(byId.get("l4")?.label, "Calasan S.A.S.");
  assert.match(byId.get("l4")?.meta ?? "", /COP/);
  // Grupos por kind
  assert.equal(byId.get("l1")?.group, "Segmentos");
  assert.equal(byId.get("l3")?.group, "Países");
  assert.equal(byId.get("l4")?.group, "Clientes");
});

test("marca huérfanas de cliente como no elegibles", () => {
  const opts = buildPriceListOptions(lists);
  const orphan = opts.find((o) => o.value === "l5")!;
  assert.equal(orphan.disabled, true);
  assert.match(orphan.label, /sin cliente asignado/);
});

test("sugiere export por país", () => {
  assert.equal(
    suggestPriceList(lists, { country: "Guatemala", customerType: "cliente_directo" })?.id,
    "l3",
  );
});

test("sugiere segmento por tipo de cliente nacional", () => {
  assert.equal(
    suggestPriceList(lists, { country: "Colombia", customerType: "distribuidor" })?.id,
    "l2",
  );
  assert.equal(
    suggestPriceList(lists, { country: "Colombia", customerType: "cliente_directo" })?.id,
    "l1",
  );
});

test("no sugiere si ya tiene lista de cliente válida", () => {
  // País export pero con lista cliente ya asignada: no pisar
  assert.equal(
    suggestPriceList(lists, { country: "Colombia", customerType: "otro", currentPriceListId: "l4" }),
    undefined,
  );
});
