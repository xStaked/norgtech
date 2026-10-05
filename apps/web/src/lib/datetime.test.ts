// npx -y tsx --test src/lib/datetime.test.ts   (desde apps/web)
//
// La zona del proceso se fija en UTC (hostil): toda la doctrina de datetime.ts
// es que las funciones fijan America/Bogota SIEMPRE. Si alguna dejara que la
// zona del proceso decida, vuelve el desfase de 5 horas que reporto QA y estos
// casos caen — la agenda (vista mensual incluida) agrupa por dia natural con
// `dayKeyInBogota`, asi que este es el guard de su entrada.
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import { test } from "node:test";

import { dayKeyInBogota, isSameDayInBogota, shortTimeFormatter } from "./datetime.ts";

test("dayKeyInBogota: la madrugada UTC sigue siendo el dia anterior en Bogota", () => {
  // 02:00Z del dia 17 = 21:00 del 16 en Bogota (UTC-5): el desfase que reporto QA.
  assert.equal(dayKeyInBogota("2026-07-17T02:00:00.000Z"), "2026-07-16");
  // 04:59Z del 16 = 23:59 del 15 en Bogota.
  assert.equal(dayKeyInBogota("2026-07-16T04:59:00.000Z"), "2026-07-15");
  // Mediodia colombiano: mismo dia natural.
  assert.equal(dayKeyInBogota("2026-07-16T17:00:00.000Z"), "2026-07-16");
});

test("isSameDayInBogota compara el dia natural, no la cadena ni el instante UTC", () => {
  // 17:00 del 16 vs 21:00 del 16 en Bogota: instantes y cadenas UTC distintas,
  // mismo dia natural.
  assert.equal(isSameDayInBogota("2026-07-16T22:00:00.000Z", "2026-07-17T02:00:00.000Z"), true);
  assert.equal(isSameDayInBogota("2026-07-16T22:00:00.000Z", "2026-07-17T05:01:00.000Z"), false);
});

test("shortTimeFormatter fija la hora de Bogota aunque el proceso este en UTC", () => {
  const time = (iso: string) => shortTimeFormatter.format(new Date(iso));
  // 14:30Z = 09:30 Bogota (la hora UTC "14:30" no puede aparecer).
  assert.match(time("2026-07-16T14:30:00.000Z"), /09:30/);
  // 02:00Z del 17 = 21:00 del 16 en Bogota: h23 la pinta "21:00", h12 "09:00 p. m.".
  assert.match(time("2026-07-17T02:00:00.000Z"), /(09:00|21:00)/);
});
