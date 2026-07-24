import { Prisma } from "@prisma/client";
import { PricingService } from "../src/modules/pricing/pricing.service";
import { PrismaService } from "../src/prisma/prisma.service";

describe("PricingService", () => {
  const product = {
    id: "product-1",
    name: "Fertilizante NPK",
    sku: "SKU-1",
    unit: "bulto",
    basePrice: new Prisma.Decimal(100),
  };

  /**
   * Precios de lista de ACE TECH en AVSA: dos empaques a precios muy
   * distintos, que es justo el caso donde adivinar sale caro.
   */
  const listItems = [
    {
      priceListId: "list-avsa",
      presentationId: "pres-500g",
      priceSinIva: new Prisma.Decimal(84238.1),
      priceConIva: new Prisma.Decimal(88450),
      taxPercent: new Prisma.Decimal(5),
      priceList: { name: "AVSA", currency: "COP" },
      presentation: { empaque: "Bolsa x 500 g", form: "Polvo soluble" },
    },
    {
      priceListId: "list-avsa",
      presentationId: "pres-25kg",
      priceSinIva: new Prisma.Decimal(2350554),
      priceConIva: new Prisma.Decimal(2468081.7),
      taxPercent: new Prisma.Decimal(5),
      priceList: { name: "AVSA", currency: "COP" },
      presentation: { empaque: "Saco x 25 Kg.", form: "Premix" },
    },
  ];

  function buildPrismaStub(opts: { salesYTD?: number; aggregateSpy?: jest.Mock } = {}) {
    const aggregate =
      opts.aggregateSpy ??
      jest.fn(async () => ({ _sum: { total: opts.salesYTD ?? 0 } }));

    const prismaStub = {
      order: { aggregate },
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === product.id ? product : null,
      },
      priceListItem: {
        findMany: async ({
          where,
        }: {
          where: { priceListId: string; presentation: { productId: string; id?: string } };
        }) =>
          listItems.filter(
            (item) =>
              item.priceListId === where.priceListId &&
              where.presentation.productId === product.id &&
              (where.presentation.id === undefined ||
                item.presentationId === where.presentation.id),
          ),
      },
    };

    return { prismaStub, aggregate };
  }

  function makeService(opts: { salesYTD?: number; aggregateSpy?: jest.Mock } = {}) {
    const { prismaStub, aggregate } = buildPrismaStub(opts);
    const service = new PricingService(prismaStub as unknown as PrismaService);
    return { service, aggregate };
  }

  const customerMeetsGoal = {
    id: "customer-1",
    segment: {
      name: "Oro",
      discountPercent: new Prisma.Decimal(10),
      minGoalAmount: new Prisma.Decimal(30_000_000),
    },
  };

  const customerNoSegment = { id: "customer-2", segment: null };

  const customerZeroDiscountSegment = {
    id: "customer-3",
    segment: {
      name: "Bronce",
      discountPercent: new Prisma.Decimal(0),
      minGoalAmount: new Prisma.Decimal(1_000_000),
    },
  };

  describe("resolveSegmentDiscount", () => {
    it("returns the segment discount when salesYTD meets the goal", async () => {
      const { service, aggregate } = makeService({ salesYTD: 45_000_000 });
      const result = await service.resolveSegmentDiscount(customerMeetsGoal);

      expect(result.discountPercent.toNumber()).toBe(10);
      expect(result.meetsGoal).toBe(true);
      expect(result.salesYTD.toNumber()).toBe(45_000_000);
      expect(result.goalThreshold.toNumber()).toBe(30_000_000);
      expect(Number.isNaN(result.discountPercent.toNumber())).toBe(false);

      const callArgs = aggregate.mock.calls[0][0];
      expect(callArgs.where.customerId).toBe("customer-1");
      expect(callArgs.where.status.in).toEqual([
        "facturado",
        "despachado",
        "en_transito",
        "entregado",
      ]);
      expect(callArgs.where.orderDate.gte).toBeInstanceOf(Date);
      expect(callArgs.where.orderDate.lte).toBeInstanceOf(Date);
      expect(callArgs._sum).toEqual({ total: true });
    });

    it("returns 0 discount when salesYTD does not meet the goal", async () => {
      const { service } = makeService({ salesYTD: 12_000_000 });
      const result = await service.resolveSegmentDiscount(customerMeetsGoal);

      expect(result.discountPercent.toNumber()).toBe(0);
      expect(result.meetsGoal).toBe(false);
      expect(result.salesYTD.toNumber()).toBe(12_000_000);
      expect(Number.isNaN(result.discountPercent.toNumber())).toBe(false);
    });

    it("treats salesYTD exactly equal to the goal as meeting it (gte)", async () => {
      const { service } = makeService({ salesYTD: 30_000_000 });
      const result = await service.resolveSegmentDiscount(customerMeetsGoal);

      expect(result.meetsGoal).toBe(true);
      expect(result.discountPercent.toNumber()).toBe(10);
    });

    it("returns 0 discount without querying sales when customer has no segment", async () => {
      const { service, aggregate } = makeService();
      const result = await service.resolveSegmentDiscount(customerNoSegment);

      expect(result.discountPercent.toNumber()).toBe(0);
      expect(result.meetsGoal).toBe(false);
      expect(result.salesYTD.toNumber()).toBe(0);
      expect(result.goalThreshold.toNumber()).toBe(0);
      expect(Number.isNaN(result.discountPercent.toNumber())).toBe(false);
      expect(aggregate).not.toHaveBeenCalled();
    });

    it("reports real goal progress for a zero-discount segment", async () => {
      const { service, aggregate } = makeService({ salesYTD: 5_000_000 });
      const result = await service.resolveSegmentDiscount(customerZeroDiscountSegment);

      // A 0% segment still has a goal the preview must report honestly:
      // short-circuiting here made the UI show 0 progress for a customer well
      // past their threshold.
      expect(result.discountPercent.toNumber()).toBe(0);
      expect(result.salesYTD.toNumber()).toBe(5_000_000);
      expect(result.goalThreshold.toNumber()).toBe(1_000_000);
      expect(result.meetsGoal).toBe(true);
      expect(aggregate).toHaveBeenCalled();
    });
  });

  describe("priceLines - mode 'quote' (no tax)", () => {
    it("applies the segment discount to a catalog product when the goal is met", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerMeetsGoal,
        [{ productId: product.id, quantity: 5 }],
        "quote",
      );

      const [line] = result.rawItems;
      expect(line.originalUnitPrice?.toNumber()).toBe(100);
      expect(line.discountPercent?.toNumber()).toBe(10);
      expect(line.unitPrice.toNumber()).toBe(90);
      expect(line.subtotal.toNumber()).toBe(450);
      expect(line.taxPercent.toNumber()).toBe(0);
      expect(line.taxAmount.toNumber()).toBe(0);
      expect(line.totalWithTax.toNumber()).toBe(450);
      expect(result.meetsGoal).toBe(true);
    });

    it("does not discount when the goal is not met", async () => {
      const { service } = makeService({ salesYTD: 12_000_000 });
      const result = await service.priceLines(
        customerMeetsGoal,
        [{ productId: product.id, quantity: 5 }],
        "quote",
      );

      const [line] = result.rawItems;
      expect(line.unitPrice.toNumber()).toBe(100);
      expect(line.subtotal.toNumber()).toBe(500);
      expect(line.discountPercent?.toNumber()).toBe(0);
      expect(result.meetsGoal).toBe(false);
    });

    it("keeps a custom item's typed unitPrice and never discounts it", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerMeetsGoal,
        [{ productId: null, quantity: 2, unitPrice: 250 }],
        "quote",
      );

      const [line] = result.rawItems;
      expect(line.productId).toBeNull();
      expect(line.unitPrice.toNumber()).toBe(250);
      expect(line.discountPercent).toBeNull();
      expect(line.originalUnitPrice).toBeNull();
      expect(line.subtotal.toNumber()).toBe(500);
    });
  });

  describe("priceLines - mode 'order' (with tax)", () => {
    it("computes taxAmount and totalWithTax identically to orders.service", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerMeetsGoal,
        [{ productId: product.id, quantity: 3, taxPercent: 19 }],
        "order",
      );

      const [line] = result.rawItems;
      // unitPrice = 100 * (1 - 10/100) = 90
      expect(line.unitPrice.toNumber()).toBe(90);
      expect(line.taxPercent.toNumber()).toBe(19);
      // taxAmount = round(90 * 19 / 100, 2) = 17.1
      expect(line.taxAmount.toNumber()).toBe(17.1);
      // totalWithTax = 3 * (90 + 17.1) = 321.3
      expect(line.totalWithTax.toNumber()).toBe(321.3);
      expect(line.subtotal.toNumber()).toBe(270);
    });

    it("defaults taxPercent to 19 when not provided", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerMeetsGoal,
        [{ productId: product.id, quantity: 1 }],
        "order",
      );

      expect(result.rawItems[0].taxPercent.toNumber()).toBe(19);
    });
  });

  describe("buildPreview", () => {
    it("returns a full numeric preview with no NaN when the goal is met", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const preview = await service.buildPreview(
        customerMeetsGoal,
        [{ productId: product.id, quantity: 5 }],
        "quote",
      );

      expect(preview.segmentName).toBe("Oro");
      expect(preview.discountPercent).toBe(10);
      expect(preview.meetsGoal).toBe(true);
      expect(preview.subtotal).toBe(450);
      expect(preview.taxAmount).toBe(0);
      expect(preview.total).toBe(450);
      // discountAmount = (100 - 90) * 5 = 50
      expect(preview.discountAmount).toBe(50);
      expect(Number.isNaN(preview.discountPercent)).toBe(false);
      expect(Number.isNaN(preview.discountAmount)).toBe(false);
    });

    it("returns discountPercent 0 and discountAmount 0 with no NaN when the goal is not met", async () => {
      const { service } = makeService({ salesYTD: 12_000_000 });
      const preview = await service.buildPreview(
        customerMeetsGoal,
        [{ productId: product.id, quantity: 5 }],
        "quote",
      );

      expect(preview.discountPercent).toBe(0);
      expect(preview.meetsGoal).toBe(false);
      expect(preview.subtotal).toBe(500);
      expect(preview.discountAmount).toBe(0);
      expect(Number.isNaN(preview.discountPercent)).toBe(false);
      expect(Number.isNaN(preview.discountAmount)).toBe(false);
    });

    it("returns discountPercent 0 with no NaN for a customer without a segment", async () => {
      const { service } = makeService();
      const preview = await service.buildPreview(
        customerNoSegment,
        [{ productId: product.id, quantity: 2 }],
        "quote",
      );

      expect(preview.segmentName).toBeNull();
      expect(preview.discountPercent).toBe(0);
      expect(preview.meetsGoal).toBe(false);
      expect(preview.subtotal).toBe(200);
      expect(preview.discountAmount).toBe(0);
      expect(Number.isNaN(preview.discountPercent)).toBe(false);
    });

    it("keeps a custom line unaffected by the segment discount", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const preview = await service.buildPreview(
        customerMeetsGoal,
        [{ productId: null, quantity: 2, unitPrice: 250 }],
        "quote",
      );

      const [line] = preview.lines;
      expect(line.unitPrice).toBe(250);
      expect(line.discountPercent).toBe(0);
      expect(line.originalUnitPrice).toBeNull();
      expect(preview.discountAmount).toBe(0);
    });
  });

  describe("priceLines con lista de precios del cliente", () => {
    // Mismo segmento con 10% y meta cumplida que arriba, pero con lista.
    const customerWithList = { ...customerMeetsGoal, priceListId: "list-avsa" };

    it("cotiza al precio de lista y NO le aplica el descuento de segmento encima", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerWithList,
        [{ productId: product.id, quantity: 2, presentationId: "pres-500g" }],
        "quote",
      );

      const [line] = result.rawItems;
      // Gana el precio negociado, no basePrice (100) ni 100 − 10%.
      expect(line.unitPrice.toNumber()).toBe(84238.1);
      // El 10% del segmento no se aplica: sería descontar dos veces sobre un
      // precio que el cliente ya acordó.
      expect(line.discountPercent?.toNumber()).toBe(0);
      expect(line.originalUnitPrice?.toNumber()).toBe(84238.1);
      expect(line.subtotal.toNumber()).toBe(168476.2);
      expect(line.productPresentation).toBe("Bolsa x 500 g");
      expect(line.priceListName).toBe("AVSA");
    });

    it("rechaza la linea si hay varias presentaciones con precio y nadie dijo cual", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });

      // Cotizar el empaque equivocado despacha el producto equivocado, y aqui
      // la diferencia es 84 mil contra 2,3 millones.
      await expect(
        service.priceLines(customerWithList, [{ productId: product.id, quantity: 1 }], "quote"),
      ).rejects.toThrow(/varias presentaciones con precio/i);
    });

    it("desambigua por el empaque en texto, sin importar mayusculas ni espacios", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerWithList,
        [{ productId: product.id, quantity: 1, presentation: "  saco x 25   kg. " }],
        "quote",
      );

      expect(result.rawItems[0].unitPrice.toNumber()).toBe(2350554);
      expect(result.rawItems[0].productPresentation).toBe("Saco x 25 Kg.");
    });

    it("no desambigua con un texto que empata con varias, y rechaza", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });

      await expect(
        service.priceLines(
          customerWithList,
          [{ productId: product.id, quantity: 1, presentation: "bolsa" }],
          "quote",
        ),
      ).rejects.toThrow(/varias presentaciones con precio/i);
    });

    it("usa el IVA de la lista en pedidos, no el 19% por defecto", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerWithList,
        [{ productId: product.id, quantity: 1, presentationId: "pres-500g" }],
        "order",
      );

      const [line] = result.rawItems;
      // El catalogo real es 0%, 5% o 10%; 19% no existe en estas listas.
      expect(line.taxPercent.toNumber()).toBe(5);
      expect(line.taxAmount.toNumber()).toBe(4211.91);
    });

    it("respeta el taxPercent explicito del DTO sobre el de la lista", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerWithList,
        [{ productId: product.id, quantity: 1, presentationId: "pres-500g", taxPercent: 0 }],
        "order",
      );

      expect(result.rawItems[0].taxPercent.toNumber()).toBe(0);
    });

    it("cae a basePrice con descuento cuando el cliente no tiene lista", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        customerMeetsGoal,
        [{ productId: product.id, quantity: 1 }],
        "quote",
      );

      const [line] = result.rawItems;
      expect(line.unitPrice.toNumber()).toBe(90);
      expect(line.discountPercent?.toNumber()).toBe(10);
      expect(line.priceListName).toBeNull();
    });

    it("cae a basePrice si el producto no esta en la lista del cliente", async () => {
      const { service } = makeService({ salesYTD: 45_000_000 });
      const result = await service.priceLines(
        { ...customerMeetsGoal, priceListId: "list-vacia" },
        [{ productId: product.id, quantity: 1 }],
        "quote",
      );

      expect(result.rawItems[0].unitPrice.toNumber()).toBe(90);
    });
  });
});
