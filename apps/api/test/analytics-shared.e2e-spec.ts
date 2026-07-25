import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import {
  bucketKey,
  bucketsBetween,
  envelope,
  percent,
  previousYearRange,
  resolveFilters,
  returnWhere,
  toCsv,
} from "../src/modules/analytics/analytics.shared";
import { AuthUser } from "../src/modules/auth/types/authenticated-request";

/**
 * Reglas transversales de analitica (docs/analytics-spec.md §2).
 *
 * Todo lo que se prueba aqui es PURO: si estas piezas se desalinean, las cuatro
 * pantallas dejan de cuadrar entre si — que es justo lo que el contrato existe
 * para evitar. No toca base de datos.
 */

const admin: AuthUser = { id: "u-admin", email: "a@x.co", role: UserRole.administrador };
const seller: AuthUser = { id: "u-seller", email: "s@x.co", role: UserRole.comercial };

describe("Analitica · reglas compartidas", () => {
  describe("rango y zona horaria", () => {
    it("los limites del rango son hora de pared de Bogota, no del proceso", () => {
      const filters = resolveFilters({ from: "2026-01-01", to: "2026-01-31" }, admin);
      // 00:00 en Bogota (-05:00) son las 05:00 UTC del mismo dia.
      expect(filters.from.toISOString()).toBe("2026-01-01T05:00:00.000Z");
      expect(filters.to.toISOString()).toBe("2026-02-01T04:59:59.999Z");
    });

    it("sin rango explicito usa los ultimos 90 dias", () => {
      const filters = resolveFilters({ to: "2026-07-25" }, admin);
      expect(filters.fromDate).toBe("2026-04-26");
    });

    it("rechaza un rango invertido en vez de devolver cero silencioso", () => {
      expect(() => resolveFilters({ from: "2026-07-25", to: "2026-01-01" }, admin)).toThrow(
        BadRequestException,
      );
    });

    it("rechaza una fecha que no es YYYY-MM-DD", () => {
      expect(() => resolveFilters({ from: "ayer" }, admin)).toThrow(BadRequestException);
    });
  });

  describe("forzado por rol", () => {
    it("un comercial queda acotado a si mismo aunque pida el id de otro", () => {
      const filters = resolveFilters({ sellerUserId: "u-otro" }, seller);
      expect(filters.sellerUserId).toBe("u-seller");
    });

    it("la envoltura devuelve el filtro APLICADO, no el pedido", () => {
      const filters = resolveFilters({ sellerUserId: "u-otro" }, seller);
      expect(envelope(filters).filters.sellerUserId).toBe("u-seller");
    });

    it("un administrador si puede mirar a un vendedor concreto", () => {
      expect(resolveFilters({ sellerUserId: "u-otro" }, admin).sellerUserId).toBe("u-otro");
    });
  });

  describe("moneda", () => {
    it("por defecto es COP: nunca hay una consulta sin moneda acotada", () => {
      expect(resolveFilters({}, admin).currency).toBe("COP");
    });
  });

  describe("buckets de la serie", () => {
    it("agrupa por mes en hora de Bogota", () => {
      // 2026-08-01T02:00Z son las 21:00 del 31 de julio en Bogota: mes de julio.
      expect(bucketKey(new Date("2026-08-01T02:00:00.000Z"), "month")).toBe("2026-07");
    });

    it("la semana arranca en lunes", () => {
      // 2026-07-25 es sabado; su semana empieza el lunes 20.
      expect(bucketKey(new Date("2026-07-25T17:00:00.000Z"), "week")).toBe("2026-07-20");
    });

    it("la serie no tiene huecos: incluye los buckets vacios", () => {
      const filters = resolveFilters({ from: "2026-01-01", to: "2026-04-15" }, admin);
      expect(bucketsBetween(filters.from, filters.to, "month")).toEqual([
        "2026-01",
        "2026-02",
        "2026-03",
        "2026-04",
      ]);
    });
  });

  describe("comparativo", () => {
    it("es el MISMO rango un año antes, no el periodo inmediatamente anterior", () => {
      const filters = resolveFilters({ from: "2026-01-01", to: "2026-07-25" }, admin);
      const previous = previousYearRange(filters);
      expect(previous.fromDate).toBe("2025-01-01");
      expect(previous.toDate).toBe("2025-07-25");
    });
  });

  describe("porcentajes", () => {
    it("divisor cero da 0, nunca NaN ni Infinity", () => {
      expect(percent(5, 0)).toBe(0);
      expect(Number.isFinite(percent(0, 0))).toBe(true);
    });

    it("redondea a un decimal", () => {
      expect(percent(1, 3)).toBe(33.3);
    });
  });

  describe("devoluciones (RET-02)", () => {
    it("con empresa seleccionada, la devolucion se acota por su pedido o su factura", () => {
      const where = returnWhere(resolveFilters({ companyId: "co-nt" }, admin));
      expect(where.AND).toEqual([
        { OR: [{ order: { companyId: "co-nt" } }, { invoice: { companyId: "co-nt" } }] },
      ]);
    });

    it("sin empresa seleccionada no se acota por empresa: la vista global las incluye todas", () => {
      const where = returnWhere(resolveFilters({}, admin));
      expect(where.AND).toBeUndefined();
    });

    it("el vendedor de una devolucion es el del pedido devuelto", () => {
      const where = returnWhere(resolveFilters({ sellerUserId: "u-1" }, admin));
      expect(where.AND).toEqual([{ order: { sellerUserId: "u-1" } }]);
    });
  });

  describe("csv", () => {
    it("separa con ; y escapa comillas — Excel es-CO usa la coma como decimal", () => {
      const csv = toCsv([{ name: 'AV"SA', total: 12.5 }], [
        { header: "Cliente", value: (row) => row.name },
        { header: "Total", value: (row) => row.total },
      ]);
      expect(csv).toBe('﻿Cliente;Total\n"AV""SA";12.5');
    });
  });
});
