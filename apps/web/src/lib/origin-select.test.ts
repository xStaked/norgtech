// node --test src/lib/origin-select.test.ts   (desde apps/web)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  orderOptionsForCustomer,
  quoteOptionsForCustomer,
} from "./origin-select.ts";

const orders = [
  { id: "o1", customerId: "c1", orderNumber: "NT-1", total: "100000" },
  { id: "o2", customer: { id: "c1" }, orderNumber: null, total: "50000" },
  { id: "o3", customerId: "c2", orderNumber: "NT-3", total: "999" },
] as never[];

const quotes = [
  { id: "q1", customerId: "c1", total: "200000" },
  { id: "q2", customer: { id: "c2" }, total: "10" },
] as never[];

test("solo pedidos del cliente elegido", () => {
  const opts = orderOptionsForCustomer(orders, "c1");
  assert.deepEqual(
    opts.map((o) => o.value).sort(),
    ["o1", "o2"],
  );
});

test("sin cliente no ofrece origenes", () => {
  assert.deepEqual(orderOptionsForCustomer(orders, ""), []);
  assert.deepEqual(quoteOptionsForCustomer(quotes, ""), []);
});

test("solo cotizaciones del cliente elegido", () => {
  assert.deepEqual(
    quoteOptionsForCustomer(quotes, "c1").map((o) => o.value),
    ["q1"],
  );
});
