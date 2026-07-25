// node --test src/lib/list-filter.test.ts   (desde apps/web; Node 24 strippea tipos)
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFilters, optionsFrom, param } from "./list-filter.ts";

const rows = [
  { name: "Cotización especial", sku: "A-1", unit: "kg", active: true },
  { name: "Premix bovino", sku: "B-2", unit: "L", active: false },
  { name: "Sal mineralizada", sku: "C-3", unit: "kg", active: true },
];

const spec = {
  search: (row: (typeof rows)[number]) => [row.name, row.sku],
  match: {
    unit: (row: (typeof rows)[number]) => row.unit,
    active: (row: (typeof rows)[number]) => String(row.active),
  },
};

test("sin parametros devuelve todo", () => {
  assert.equal(applyFilters(rows, {}, spec).length, 3);
});

test("la busqueda ignora tildes y mayusculas", () => {
  assert.deepEqual(
    applyFilters(rows, { search: "COTIZACION" }, spec).map((r) => r.sku),
    ["A-1"],
  );
});

test("los selects se acumulan con la busqueda", () => {
  assert.deepEqual(
    applyFilters(rows, { unit: "kg", active: "true", search: "sal" }, spec).map((r) => r.sku),
    ["C-3"],
  );
  assert.deepEqual(applyFilters(rows, { unit: "kg", active: "false" }, spec), []);
});

test("un parametro vacio no filtra", () => {
  assert.equal(applyFilters(rows, { unit: "", search: "" }, spec).length, 3);
  assert.equal(param({ unit: "" }, "unit"), undefined);
  assert.equal(param({ unit: ["kg", "L"] }, "unit"), "kg");
});

test("optionsFrom deduplica y ordena", () => {
  assert.deepEqual(optionsFrom(rows, (r) => r.unit), [
    { value: "kg", label: "kg" },
    { value: "L", label: "L" },
  ]);
});
