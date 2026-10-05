// node --test src/lib/price-history.test.ts   (desde apps/web)
import assert from "node:assert/strict";
import { test } from "node:test";
import { describePriceChange, isCreation, summarizeHistory } from "./price-history.ts";

test("creación (sin antes) se marca como nuevo precio", () => {
  const entry = {
    id: "a1",
    actorUserId: "u1",
    createdAt: "2026-09-01T10:00:00.000Z",
    action: "price_list.item_upserted",
    previousState: null,
    nextState: { presentationId: "p1", empaque: "Bolsa x 500 g", priceSinIva: 100 },
  };

  assert.equal(isCreation(entry), true);
  assert.equal(describePriceChange(entry.previousState, entry.nextState), "— → 100 (nuevo)");
});

test("cambio de precio muestra antes → después", () => {
  const before = { presentationId: "p1", empaque: "Bolsa x 500 g", priceSinIva: 100 };
  const after = { presentationId: "p1", empaque: "Bolsa x 500 g", priceSinIva: 120 };

  assert.equal(isCreation({ previousState: before } as never), false);
  assert.equal(describePriceChange(before, after), "100 → 120");
});

test("resumen ordena por fecha descendente y resume cada entrada", () => {
  const entries = [
    {
      id: "a-old",
      actorUserId: "u1",
      createdAt: "2026-01-10T00:00:00.000Z",
      action: "price_list.item_upserted",
      previousState: null,
      nextState: { presentationId: "p1", empaque: "Bolsa x 500 g", priceSinIva: 90 },
    },
    {
      id: "a-new",
      actorUserId: "u2",
      createdAt: "2026-09-20T00:00:00.000Z",
      action: "price_list.item_upserted",
      previousState: { presentationId: "p1", empaque: "Bolsa x 500 g", priceSinIva: 90 },
      nextState: { presentationId: "p1", empaque: "Bolsa x 500 g", priceSinIva: 120 },
    },
  ];

  const summary = summarizeHistory(entries);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].id, "a-new");
  assert.equal(summary[0].change, "90 → 120");
  assert.equal(summary[1].change, "— → 90 (nuevo)");
});
