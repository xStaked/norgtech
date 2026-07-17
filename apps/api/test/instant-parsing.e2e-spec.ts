import { parseInstant, toInstantIso } from "../src/shared/instant";

/**
 * VIS-03. Una fecha-hora SIN offset ("2026-06-29T12:00:00") no es ambigua en
 * este negocio: significa hora de pared en Colombia. Lo que estaba roto no era
 * la falta de offset, sino que `new Date()` la interpretaba en la zona del
 * SERVIDOR (en un host UTC, las 12:00 de Colombia se guardaban como 12:00Z =
 * 07:00 Colombia).
 *
 * Rechazarla tampoco sirve: Nora (agents/nora/src/tools/visits.py) postea a
 * /visits con el `scheduled_at` que produce el LLM, sin offset — exigirlo
 * rompe la creacion de visitas por WhatsApp en produccion.
 */
describe("parseInstant", () => {
  it("interpreta una fecha sin offset como hora de pared en Colombia", () => {
    // Exactamente el payload de agents/nora/tests/test_visits_tool.py
    const parsed = parseInstant("2026-06-29T12:00:00");

    // 12:00 en Bogota (UTC-5) es 17:00 UTC. NO 12:00 UTC.
    expect(parsed.toISOString()).toBe("2026-06-29T17:00:00.000Z");
  });

  it("respeta un offset explicito cuando viene", () => {
    expect(parseInstant("2026-06-29T12:00:00.000Z").toISOString()).toBe(
      "2026-06-29T12:00:00.000Z",
    );
    expect(parseInstant("2026-06-29T12:00:00-05:00").toISOString()).toBe(
      "2026-06-29T17:00:00.000Z",
    );
  });

  it("trata el formato del datetime-local del navegador como hora de Colombia", () => {
    // Lo que manda <input type="datetime-local"> sin segundos.
    expect(parseInstant("2026-07-16T14:30").toISOString()).toBe(
      "2026-07-16T19:30:00.000Z",
    );
  });

  // Estos son los tests que de verdad protegen VIS-03. Los de arriba, que
  // comparan Dates, pasan igual con y sin el fix en una maquina que ya corre en
  // America/Bogota (solo fallan en un host UTC), asi que no sirven de guardia.
  // `toInstantIso` es string->string: su resultado no depende del TZ del proceso.
  describe("toInstantIso (independiente del TZ del proceso)", () => {
    it("le pega el offset de Colombia a una fecha sin offset", () => {
      expect(toInstantIso("2026-06-29T12:00:00")).toBe("2026-06-29T12:00:00-05:00");
      expect(toInstantIso("2026-07-16T14:30")).toBe("2026-07-16T14:30-05:00");
    });

    it("no toca una fecha que ya trae offset", () => {
      expect(toInstantIso("2026-06-29T12:00:00.000Z")).toBe("2026-06-29T12:00:00.000Z");
      expect(toInstantIso("2026-06-29T12:00:00-05:00")).toBe("2026-06-29T12:00:00-05:00");
    });
  });

  it("rechaza una cadena que no es fecha", () => {
    expect(() => parseInstant("no soy fecha")).toThrow();
  });
});
