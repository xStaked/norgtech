// npx -y tsx --test src/lib/agenda-month.test.ts   (desde apps/web)
//
// Igual que date-grid.test.ts, la zona del proceso se fija antes de correr los
// casos — aquí en UTC (hostil) — para demostrar que nada de lo probado depende
// de ella: los items llegan con `day` ya resuelto a dia natural de la zona del
// negocio por `dayKeyInBogota` (datetime.ts) y este módulo solo agrupa/compara
// contra la terna del mes con el parseo estricto de `date-grid.ts`.
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import { test } from "node:test";

import { monthGrid } from "./date-grid.ts";
import {
  filterByMonth,
  formatMonthParam,
  indexByDay,
  parseMonthParam,
} from "./agenda-month.ts";

interface Item {
  day: string;
  label: string;
}

test("parseMonthParam acepta YYYY-MM estricto", () => {
  assert.deepEqual(parseMonthParam("2026-07", "2026-10-05"), { year: 2026, month: 7 });
  assert.deepEqual(parseMonthParam("2025-12", "2026-10-05"), { year: 2025, month: 12 });
  assert.deepEqual(parseMonthParam("2026-01", "2026-10-05"), { year: 2026, month: 1 });
});

test("parseMonthParam cae al mes de hoy cuando falta o es invalido", () => {
  const today = "2026-10-05";
  assert.deepEqual(parseMonthParam(undefined, today), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthParam("", today), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthParam("2026-13", today), { year: 2026, month: 10 }); // mes inexistente
  assert.deepEqual(parseMonthParam("2026-7", today), { year: 2026, month: 10 }); // sin cero de relleno
  assert.deepEqual(parseMonthParam("2026/07", today), { year: 2026, month: 10 }); // separador ajeno
  assert.deepEqual(parseMonthParam("2026-07-15", today), { year: 2026, month: 10 }); // el parametro es YYYY-MM, no un dia
  assert.deepEqual(parseMonthParam("julio", today), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthParam("0000-05", today), { year: 2026, month: 10 }); // año invalido
  assert.deepEqual(parseMonthParam("2026-07", "2026-10-05"), { year: 2026, month: 7 }); // valido manda sobre el respaldo
});

test("formatMonthParam emite YYYY-MM y cierra el ciclo con parseMonthParam", () => {
  assert.equal(formatMonthParam(2026, 7), "2026-07");
  assert.equal(formatMonthParam(2026, 12), "2026-12");
  assert.equal(formatMonthParam(2026, 1), "2026-01");
  assert.deepEqual(parseMonthParam(formatMonthParam(2027, 2), "2026-10-05"), {
    year: 2027,
    month: 2,
  });
});

test("filterByMonth deja solo los dias del mes y conserva el orden", () => {
  const items: Item[] = [
    { day: "2026-06-30", label: "fuera-antes" },
    { day: "2026-07-01", label: "primero" },
    { day: "2026-07-16", label: "mitad" },
    { day: "2026-07-31", label: "ultimo" },
    { day: "2026-08-01", label: "fuera-despues" },
    { day: "16/07/2026", label: "malformado" },
    { day: "", label: "vacio" },
  ];
  assert.deepEqual(
    filterByMonth(items, 2026, 7).map((item) => item.label),
    ["primero", "mitad", "ultimo"],
  );
});

test("filterByMonth con mes sin items devuelve vacio y no lanza", () => {
  const items: Item[] = [{ day: "2026-07-16", label: "mitad" }];
  assert.deepEqual(filterByMonth(items, 2027, 1), []);
});

test("indexByDay agrupa por dia y conserva el orden de llegada", () => {
  const byDay = indexByDay<Item>([
    { day: "2026-07-16", label: "a" },
    { day: "2026-07-17", label: "b" },
    { day: "2026-07-16", label: "c" },
  ]);
  assert.deepEqual(
    (byDay.get("2026-07-16") ?? []).map((item) => item.label),
    ["a", "c"],
  );
  assert.deepEqual(
    (byDay.get("2026-07-17") ?? []).map((item) => item.label),
    ["b"],
  );
  assert.equal(byDay.size, 2);
});

test("indexByDay sin items devuelve un mapa vacio", () => {
  assert.equal(indexByDay([]).size, 0);
});

test("las celdas de relleno de monthGrid encuentran sus items por ISO", () => {
  // La grilla de jul-2026 arranca el lunes 29 de jun (celda de relleno) y
  // termina el domingo 9 de ago: los compromisos del mes vecino se pintan
  // tenues en esas celdas, así que el índice debe resolverlas.
  const cells = monthGrid(2026, 7);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].iso, "2026-06-29");
  assert.equal(cells[0].inMonth, false);
  assert.equal(cells[41].iso, "2026-08-09");

  const byDay = indexByDay<Item>([{ day: "2026-06-29", label: "relleno" }]);
  assert.deepEqual(
    (byDay.get(cells[0].iso) ?? []).map((item) => item.label),
    ["relleno"],
  );
});
