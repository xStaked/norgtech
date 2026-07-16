import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CreditService } from "../src/modules/credit/credit.service";

/**
 * Regression e2e para la carrera TOCTOU del chequeo de cupo (commit 2870fd7).
 *
 * Solo se reproduce contra Postgres real: el bug vive en el aislamiento READ
 * COMMITTED de dos transacciones concurrentes, asi que un spec con PrismaService
 * mockeado no lo puede ver. Por eso este spec usa el modulo real, sin
 * `.overrideProvider(PrismaService)` (mismo patron que `app.e2e-spec.ts`).
 *
 * Escenario: cliente con cupo de $1.000.000 y dos pedidos de $600.000 en estado
 * `recibido` (no consume cupo). Dos "aprobaciones" concurrentes intentan pasar
 * cada pedido a `orden_facturacion`. Sin el row lock de `assertCreditLimit`,
 * ambas leen exposicion 0, ambas pasan y el cliente queda en $1.200.000.
 * Con el lock, exactamente una pasa.
 */

const MARKER = `e2e-credit-conc-${process.pid}-${Date.now()}`;
const CUSTOMER_ID = `${MARKER}-customer`;
const ORDER_A_ID = `${MARKER}-order-a`;
const ORDER_B_ID = `${MARKER}-order-b`;

const CREDIT_LIMIT = 1_000_000;
const ORDER_TOTAL = 600_000;

describe("CreditService.assertCreditLimit concurrencia (TOCTOU)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;

  let customersBefore = 0;
  let ordersBefore = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    creditService = app.get(CreditService);

    customersBefore = await prisma.customer.count();
    ordersBefore = await prisma.order.count();

    // Reutilizamos company/segment ya sembrados: no creamos catalogos nuevos.
    const company = await prisma.company.findFirst({ select: { id: true } });
    const segment = await prisma.customerSegment.findFirst({ select: { id: true } });
    if (!company || !segment) {
      throw new Error("La base necesita al menos una Company y un CustomerSegment sembrados");
    }

    await prisma.customer.create({
      data: {
        id: CUSTOMER_ID,
        legalName: `${MARKER} SAS`,
        displayName: `${MARKER}`,
        segmentId: segment.id,
        creditLimit: new Prisma.Decimal(CREDIT_LIMIT),
        createdBy: MARKER,
        updatedBy: MARKER,
      },
    });

    for (const id of [ORDER_A_ID, ORDER_B_ID]) {
      await prisma.order.create({
        data: {
          id,
          orderNumber: id,
          customerId: CUSTOMER_ID,
          companyId: company.id,
          orderDate: new Date(),
          status: "recibido",
          subtotal: new Prisma.Decimal(ORDER_TOTAL),
          total: new Prisma.Decimal(ORDER_TOTAL),
          createdBy: MARKER,
          updatedBy: MARKER,
        },
      });
    }
  });

  afterAll(async () => {
    // Limpieza exacta por marcador, en orden seguro para las FK. Corre aunque
    // las aserciones fallen; la base debe quedar igual que como se encontro.
    if (prisma) {
      await prisma.order.deleteMany({ where: { id: { in: [ORDER_A_ID, ORDER_B_ID] } } });
      await prisma.customer.deleteMany({ where: { id: CUSTOMER_ID } });

      expect(await prisma.customer.count()).toBe(customersBefore);
      expect(await prisma.order.count()).toBe(ordersBefore);
    }
    if (app) await app.close();
  });

  it("dos aprobaciones concurrentes del mismo cliente: solo una pasa el cupo", async () => {
    // Barrera: garantiza que ambas transacciones esten abiertas y hayan hecho al
    // menos un statement antes de que cualquiera lea la exposicion. Sin esto el
    // scheduler podria serializarlas por casualidad y el test no probaria nada.
    let openReady: () => void;
    const bothOpen = new Promise<void>((resolve) => {
      let count = 0;
      openReady = () => {
        if (++count === 2) resolve();
      };
    });

    const approve = (orderId: string) =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1`; // fuerza la apertura real de la transaccion
        openReady();
        await bothOpen;

        await creditService.assertCreditLimit(CUSTOMER_ID, ORDER_TOTAL, tx, {
          excludeOrderId: orderId,
        });

        await tx.order.update({
          where: { id: orderId },
          data: { status: "orden_facturacion", updatedBy: MARKER },
        });
      });

    const results = await Promise.allSettled([approve(ORDER_A_ID), approve(ORDER_B_ID)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason?.message ?? rejected[0].reason)).toContain(
      "Credito excedido",
    );

    // Y lo que de verdad importa: la exposicion final no supera el cupo.
    const exposure = await creditService.getCustomerExposure(CUSTOMER_ID);
    expect(exposure.toNumber()).toBe(ORDER_TOTAL);
    expect(exposure.lte(new Prisma.Decimal(CREDIT_LIMIT))).toBe(true);
  });
});
