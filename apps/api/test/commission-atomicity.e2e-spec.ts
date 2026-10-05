import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PaymentMethod, Prisma, UserRole } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AuthUser } from "../src/modules/auth/types/authenticated-request";
import { CommissionsService } from "../src/modules/commissions/commissions.service";
import { InvoicesService } from "../src/modules/invoices/invoices.service";
import { ReturnsService } from "../src/modules/returns/returns.service";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Atomicidad de la causación contra Postgres real (patrón
 * `credit-concurrency.e2e-spec.ts`: módulo real, sin
 * `.overrideProvider(PrismaService)`). Los specs con PrismaService mockeado
 * no pueden probar que el `commission.create` viva dentro de la transacción
 * del pago: el stub ejecuta el callback sin rollback posible.
 *
 * Corre con: DATABASE_URL=postgresql://xstaked@localhost:5432/norgtech_comm_test
 *   npx jest --config test/jest-e2e.json test/commission-atomicity.e2e-spec.ts
 * (base scratch: `prisma migrate deploy` + filas con marcador, limpieza total
 * en afterAll aunque las aserciones fallen).
 *
 * Nota CI/DB: la suite jest-e2e no tiene patrón de skip (ningún spec usa
 * skipIf/describe.skip) ni config de CI en el repo. La mayoría de specs usan
 * stub de PrismaService (pasan sin DATABASE_URL), pero los real-DB (este y
 * credit-concurrency.e2e-spec.ts) la necesitan: este spec es real-DB a
 * propósito — el stub no puede probar atomicidad de transacciones — y falla
 * rápido y ruidoso (~2s, exit 1, mensaje claro) sin DB, en vez de colgarse
 * como el precedente y en vez de saltarse en silencio una verificación de
 * atomicidad (un DATABASE_URL apuntando mal se notaría de inmediato).
 */
const MARKER = `e2e-comm-atom-${process.pid}`;
const SELLER_ID = `${MARKER}-seller`;
const BILLING_ID = `${MARKER}-billing`;
const COMPANY_ID = `${MARKER}-company`;
const SEGMENT_ID = `${MARKER}-segment`;
const CUSTOMER_ID = `${MARKER}-customer`;
const ORDER_ID = `${MARKER}-order`;
const INVOICE_ID = `${MARKER}-invoice`;
const INVOICE_RACE_ID = `${MARKER}-invoice-race`;
const ROLLBACK_PAYMENT_ID = `${MARKER}-payment-rollback`;
const RACE_PAYMENT_ID = `${MARKER}-payment-race`;

describe("Commission atomicity on real Postgres", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dbReady = false;
  let commissions: CommissionsService;
  let invoices: InvoicesService;
  let returns: ReturnsService;

  const billingUser: AuthUser = {
    id: BILLING_ID,
    email: `${MARKER}@norgtech.local`,
    role: UserRole.facturacion,
  };

  async function connectOrFail() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const givingUp = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "commission-atomicity: Postgres inalcanzable (DATABASE_URL ausente o caído). Este spec es real-DB a propósito y no se omite en silencio.",
            ),
          ),
        15000,
      );
    });
    try {
      await Promise.race([prisma.$queryRaw`SELECT 1`, givingUp]);
    } finally {
      clearTimeout(timer);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    await connectOrFail();
    dbReady = true;

    commissions = app.get(CommissionsService);
    invoices = app.get(InvoicesService);
    returns = app.get(ReturnsService);

    await prisma.user.createMany({
      data: [
        {
          id: SELLER_ID,
          name: MARKER,
          email: `seller-${MARKER}@norgtech.local`,
          passwordHash: "x",
          role: UserRole.comercial,
          active: true,
        },
        {
          id: BILLING_ID,
          name: MARKER,
          email: `${MARKER}@norgtech.local`,
          passwordHash: "x",
          role: UserRole.facturacion,
          active: true,
        },
      ],
    });
    await prisma.company.create({
      data: {
        id: COMPANY_ID,
        name: MARKER,
        legalName: `${MARKER} SAS`,
        nit: `${MARKER}-nit`,
        prefix: MARKER.slice(0, 10),
      },
    });
    await prisma.customerSegment.create({
      data: {
        id: SEGMENT_ID,
        name: MARKER,
        minGoalAmount: new Prisma.Decimal(0),
        createdBy: MARKER,
        updatedBy: MARKER,
      },
    });
    await prisma.customer.create({
      data: {
        id: CUSTOMER_ID,
        legalName: `${MARKER} SAS`,
        displayName: MARKER,
        segmentId: SEGMENT_ID,
        companyId: COMPANY_ID,
        createdBy: MARKER,
        updatedBy: MARKER,
      },
    });
    await prisma.order.create({
      data: {
        id: ORDER_ID,
        orderNumber: ORDER_ID,
        customerId: CUSTOMER_ID,
        companyId: COMPANY_ID,
        status: "entregado",
        subtotal: new Prisma.Decimal(1000000),
        total: new Prisma.Decimal(1000000),
        sellerUserId: SELLER_ID,
        createdBy: MARKER,
        updatedBy: MARKER,
      },
    });
    await prisma.invoice.create({
      data: {
        id: INVOICE_ID,
        invoiceNumber: INVOICE_ID,
        customerId: CUSTOMER_ID,
        orderId: ORDER_ID,
        companyId: COMPANY_ID,
        dueDate: new Date("2026-07-15T00:00:00.000Z"),
        subtotal: new Prisma.Decimal(1000000),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(1000000),
        createdBy: MARKER,
        updatedBy: MARKER,
      },
    });
    await prisma.commissionRule.create({
      data: {
        sellerUserId: SELLER_ID,
        periodType: "mensual",
        periodValue: "2026-06",
        percent: new Prisma.Decimal(10),
        createdBy: MARKER,
        updatedBy: MARKER,
      },
    });
    await prisma.invoicePayment.create({
      data: {
        id: ROLLBACK_PAYMENT_ID,
        invoiceId: INVOICE_ID,
        paymentDate: new Date("2026-06-15T00:00:00.000Z"),
        amount: new Prisma.Decimal(500000),
        method: PaymentMethod.transferencia,
        createdBy: MARKER,
      },
    });
    await prisma.invoice.create({
      data: {
        id: INVOICE_RACE_ID,
        invoiceNumber: INVOICE_RACE_ID,
        customerId: CUSTOMER_ID,
        companyId: COMPANY_ID,
        dueDate: new Date("2026-07-15T00:00:00.000Z"),
        subtotal: new Prisma.Decimal(1000000),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(1000000),
        createdBy: MARKER,
        updatedBy: MARKER,
      },
    });
    await prisma.invoicePayment.create({
      data: {
        id: RACE_PAYMENT_ID,
        invoiceId: INVOICE_RACE_ID,
        paymentDate: new Date("2026-06-15T00:00:00.000Z"),
        amount: new Prisma.Decimal(500000),
        method: PaymentMethod.transferencia,
        createdBy: MARKER,
      },
    });
    await prisma.$transaction(async (tx) => {
      await commissions.accrueFromPayment(tx, {
        sellerUserId: SELLER_ID,
        invoiceId: INVOICE_RACE_ID,
        paymentId: RACE_PAYMENT_ID,
        base: new Prisma.Decimal(500000),
        paymentDate: new Date("2026-06-15T00:00:00.000Z"),
      });
    });
  });

  afterAll(async () => {
    try {
      // Limpieza exacta por marcador, en orden seguro para las FK. Corre aunque
      // las aserciones fallen; la base debe quedar igual que como se encontró.
      // Si nunca hubo conexión (dbReady false), no hay nada que limpiar.
      if (prisma && dbReady) {
        await prisma.commission.deleteMany({
          where: { sellerUserId: SELLER_ID },
        });
        await prisma.commissionRule.deleteMany({
          where: { sellerUserId: SELLER_ID },
        });
        await prisma.invoicePayment.deleteMany({
          where: { invoiceId: { in: [INVOICE_ID, INVOICE_RACE_ID] } },
        });
        await prisma.return.deleteMany({ where: { customerId: CUSTOMER_ID } });
        await prisma.invoice.deleteMany({
          where: { id: { in: [INVOICE_ID, INVOICE_RACE_ID] } },
        });
        await prisma.order.deleteMany({ where: { id: ORDER_ID } });
        await prisma.customer.deleteMany({ where: { id: CUSTOMER_ID } });
        await prisma.customerSegment.deleteMany({ where: { id: SEGMENT_ID } });
        await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
        await prisma.user.deleteMany({
          where: { id: { in: [SELLER_ID, BILLING_ID] } },
        });

        expect(
          await prisma.commission.count({ where: { sellerUserId: SELLER_ID } }),
        ).toBe(0);
        expect(
          await prisma.invoice.count({
            where: { id: { in: [INVOICE_ID, INVOICE_RACE_ID] } },
          }),
        ).toBe(0);
      }
    } finally {
      if (app) await app.close();
    }
  });

  it("rolls back the commission when the enclosing transaction fails", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const row = await commissions.accrueFromPayment(tx, {
          sellerUserId: SELLER_ID,
          invoiceId: INVOICE_ID,
          paymentId: ROLLBACK_PAYMENT_ID,
          base: new Prisma.Decimal(500000),
          paymentDate: new Date("2026-06-15T00:00:00.000Z"),
        });
        expect(row).not.toBeNull();
        throw new Error("boom-after-accrue");
      }),
    ).rejects.toThrow("boom-after-accrue");

    // payment-fails → no-commission: el write participó de la tx y se revirtió.
    expect(
      await prisma.commission.count({ where: { invoiceId: INVOICE_ID } }),
    ).toBe(0);
  });

  it("creates payment + commission through the real createPayment path", async () => {
    const { payment } = await invoices.createPayment(
      billingUser,
      {
        invoiceId: INVOICE_ID,
        amount: 500000,
        method: PaymentMethod.transferencia,
        paymentDate: "2026-06-20",
      },
    );
    expect(payment.id).toBeDefined();

    const rows = await prisma.commission.findMany({
      where: { invoiceId: INVOICE_ID },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].paymentId).toBe(payment.id);
    expect(rows[0].base.toNumber()).toBe(500000);
    expect(rows[0].percent.toNumber()).toBe(10);
    expect(rows[0].amount.toNumber()).toBe(50000);
    expect(rows[0].status).toBe("causada");
  });

  it("reverses proportionally through the real returns path", async () => {
    await returns.create(billingUser, {
      customerId: CUSTOMER_ID,
      invoiceId: INVOICE_ID,
      amount: 100000,
      reason: "Devolucion parcial",
    });

    const rows = await prisma.commission.findMany({
      where: { invoiceId: INVOICE_ID },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("causada");
    expect(rows[0].reversedAmount.toNumber()).toBe(10000);
    expect(rows[0].amount.minus(rows[0].reversedAmount).toNumber()).toBe(40000);
  });

  it("serializes two concurrent reversals: no lost update, never over cap", async () => {
    // Barrera (patrón credit-concurrency): ambas tx abiertas y con al menos
    // un statement antes de que cualquiera revierta. Sin el FOR UPDATE de
    // reverseForInvoice, ambas calculan el mismo pendiente (25k) y el último
    // SET pisa al primero -> 25k en vez de 50k. Con el lock, la segunda relee
    // lo ya revertido y completa hasta el tope exacto.
    let openReady!: () => void;
    const bothOpen = new Promise<void>((resolve) => {
      let count = 0;
      openReady = () => {
        if (++count === 2) resolve();
      };
    });

    const reverseOnce = () =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1`;
        openReady();
        await bothOpen;
        return commissions.reverseForInvoice(tx, INVOICE_RACE_ID, 250000);
      });

    const results = await Promise.all([reverseOnce(), reverseOnce()]);
    expect(results).toHaveLength(2);
    const total = results.reduce(
      (sum, r) => sum.plus(r.reversed),
      new Prisma.Decimal(0),
    );
    expect(total.toNumber()).toBe(50000);

    const rows = await prisma.commission.findMany({
      where: { invoiceId: INVOICE_RACE_ID },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].reversedAmount.toNumber()).toBe(50000);
    expect(rows[0].status).toBe("reversada");
  });
});
