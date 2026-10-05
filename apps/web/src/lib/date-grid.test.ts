// node --test src/lib/date-grid.test.ts   (desde apps/web)
//
// La zona del reloj del proceso se fija ANTES de correr los casos: el desfase
// que reportó QA aparece en America/Bogota (UTC-5), donde un
// `new Date("2026-07-16")` parsea el día 15 a las 19:00. Nada de lo probado
// aquí puede depender de la zona del proceso; si alguna función la mezcla,
// Estos casos fallan en esta zona.
process.env.TZ = "America/Bogota";

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addMonths,
  daysInMonth,
  firstWeekday,
  formatDateShort,
  formatMonthTitle,
  isoFromParts,
  monthGrid,
  parseIsoDate,
  todayIso,
  weekdayShortLabels,
} from "./date-grid.ts";

test("emite ISO cero relleno y sin desfase de zona", () => {
  // En UTC-5 un `new Date("2026-07-16")` con getters locales da el 15: aquí el
  // y/m/d sale tal cual se construye, nunca por una cadena parseada.
  assert.equal(isoFromParts(2026, 7, 16), "2026-07-16");
  assert.equal(isoFromParts(2026, 3, 1), "2026-03-01");
  assert.equal(isoFromParts(2026, 12, 31), "2026-12-31");
});

test("rechaza días que no existen (bisiesto incluido)", () => {
  assert.equal(isoFromParts(2024, 2, 29), "2024-02-29"); // bisiesto
  assert.equal(isoFromParts(2026, 2, 29), null); // no bisiesto
  assert.equal(isoFromParts(2026, 4, 31), null); // abril tiene 30
  assert.equal(isoFromParts(2026, 13, 1), null); // mes fuera de rango
  assert.equal(isoFromParts(2026, 0, 10), null);
  assert.equal(isoFromParts(2026, 7, 0), null);
});

test("parsea estrictamente YYYY-MM-DD", () => {
  assert.deepEqual(parseIsoDate("2026-07-16"), { year: 2026, month: 7, day: 16 });
  assert.equal(parseIsoDate("2026-2-16"), null); // sin cero de relleno
  assert.equal(parseIsoDate("2026/07/16"), null); // otro separador
  assert.equal(parseIsoDate("2026-13-01"), null);
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.equal(parseIsoDate(""), null);
});

test("los meses traen sus días (bisiesto y no)", () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2026, 7), 31);
  assert.equal(daysInMonth(2026, 4), 30);
});

test("primer día de la semana: lunes = 0 (mismo criterio que la agenda)", () => {
  assert.equal(firstWeekday(2025, 12), 0); // 1 dic 2025: lunes
  assert.equal(firstWeekday(2026, 7), 2); // 1 jul 2026: miércoles
  assert.equal(firstWeekday(2024, 2), 3); // 1 feb 2024: jueves
  assert.equal(firstWeekday(2026, 2), 6); // 1 feb 2026: domingo
});

test("la grilla del mes son 42 celdas fijas, lunes primero", () => {
  const cells = monthGrid(2026, 7);
  assert.equal(cells.length, 42);
  assert.deepEqual(
    cells.filter((cell) => cell.inMonth).map((cell) => cell.day),
    Array.from({ length: 31 }, (_, i) => i + 1),
  );
  // 1 jul 2026 es miércoles: lunes y martes de relleno, del mes anterior.
  assert.equal(cells[0].iso, "2026-06-29");
  assert.equal(cells[0].inMonth, false);
  assert.equal(cells[2].iso, "2026-07-01");
  assert.equal(cells[2].inMonth, true);
  // Última semana: 9 de agosto de relleno, domingo.
  assert.equal(cells[41].iso, "2026-08-09");
});

test("mes que arranca lunes no lleva relleno por delante", () => {
  const cells = monthGrid(2025, 12);
  assert.equal(cells[0].iso, "2025-12-01");
  assert.equal(cells[0].inMonth, true);
  assert.equal(cells.filter((cell) => cell.inMonth).length, 31);
});

test("mes que arranca domingo lleva 6 rellenos atrás", () => {
  const cells = monthGrid(2026, 2);
  assert.equal(cells[0].iso, "2026-01-26");
  assert.equal(cells[6].iso, "2026-02-01");
  assert.equal(cells.filter((cell) => cell.inMonth).length, 28);
});

test("addMonths cruza el año sin caer fuera de 1-12", () => {
  assert.deepEqual(addMonths(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(addMonths(2025, 12, 1), { year: 2026, month: 1 });
  assert.deepEqual(addMonths(2026, 7, 0), { year: 2026, month: 7 });
  assert.deepEqual(addMonths(2026, 7, 5), { year: 2026, month: 12 });
});

test("hoy es la hora de pared local, no la UTC", () => {
  // Con TZ America/Bogota, el 16 de julio a las 23:59 ya es el 17 en UTC.
  assert.equal(todayIso(new Date(2026, 6, 16, 23, 59)), "2026-07-16");
  assert.equal(todayIso(new Date(2026, 6, 16, 0, 0)), "2026-07-16");
});

test("el trigger muestra es-CO sin mover el día", () => {
  const short = formatDateShort("2026-07-16");
  assert.equal(short.startsWith("16"), true); // el día no se mueve ±1
  assert.equal(short.includes("jul"), true); // mes abreviado es-CO
  assert.equal(short.endsWith("2026"), true);

  const firstOfYear = formatDateShort("2027-01-01");
  assert.equal(firstOfYear.startsWith("01"), true);
  assert.equal(firstOfYear.includes("ene"), true);
});

test("encabezado del mes y de la semana en es-CO", () => {
  assert.match(formatMonthTitle(2026, 7), /julio/);
  assert.match(formatMonthTitle(2026, 7), /2026/);
  assert.deepEqual(weekdayShortLabels(), [
    "lun",
    "mar",
    "mié",
    "jue",
    "vie",
    "sáb",
    "dom",
  ]);
});
