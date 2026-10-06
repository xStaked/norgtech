// Verificacion de la capa de SERVICIO del allowlist MIME de soportes de pago
// (defensa en profundidad, fase 3). La e2e de invoices solo puede demostrar el
// rechazo atravesando el fileFilter del controller; aqui se instancia
// InvoicesService directamente para probar que el guard del servicio es
// independiente y tampoco autora uploads bloqueados.
import { BadRequestException } from "@nestjs/common";
import { InvoicesService } from "../src/modules/invoices/invoices.service";
import { SUPPORT_FILE_MAX_BYTES } from "../src/shared/support-file.constants";

const storageCalls: string[] = [];
const storageStub = {
  uploadFile: async (input: { fileName: string; contentType: string }) => {
    storageCalls.push(input.contentType);
    return { bucket: "test-bucket", objectKey: "test-key" };
  },
  deleteObject: async () => undefined,
};

function buildService(): InvoicesService {
  return new InvoicesService(
    {
      invoice: {
        findUnique: async () =>
          ({ id: "inv-1", orderId: null, totalPaid: 0, totalAmount: 100000, creditNoteTotal: 0, status: "emitida" }),
      },
      $transaction: async (fn: any) =>
        fn({
          order: { findUnique: async () => null },
          invoicePayment: { create: async ({ data }: any) => ({ id: "pay-1", ...data }) },
          invoice: { update: async () => ({ id: "inv-1" }) },
          auditLog: { create: async () => undefined },
        }),
    } as any,
    { record: async () => undefined } as any,
    storageStub as any,
    {} as any,
    { accrueFromPayment: async () => undefined } as any,
  );
}

const user = { id: "u", role: "administrador" } as any;

describe("InvoicesService.createPayment support guard", () => {
  beforeEach(() => {
    storageCalls.length = 0;
  });

  it("rejects disallowed MIME before anything reaches storage", async () => {
    await expect(
      buildService().createPayment(
        user,
        { invoiceId: "inv-1", amount: 1000, method: "efectivo" } as any,
        { originalname: "a.txt", mimetype: "text/plain", size: 3, buffer: Buffer.from("x") } as any,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(storageCalls).toEqual([]);
  });

  it("rejects files exceeding SUPPORT_FILE_MAX_BYTES", async () => {
    await expect(
      buildService().createPayment(
        user,
        { invoiceId: "inv-1", amount: 1000, method: "efectivo" } as any,
        {
          originalname: "big.png",
          mimetype: "image/png",
          size: SUPPORT_FILE_MAX_BYTES + 1,
          buffer: Buffer.alloc(0),
        } as any,
      ),
    ).rejects.toThrow("Payment support exceeds maximum size");

    expect(storageCalls).toEqual([]);
  });

  it("still uploads allowed mimeType application/pdf", async () => {
    await buildService().createPayment(
      user,
      { invoiceId: "inv-1", amount: 1000, method: "efectivo" } as any,
      { originalname: "ok.pdf", mimetype: "application/pdf", size: 100, buffer: Buffer.from("pdf") } as any,
    );

    expect(storageCalls).toContain("application/pdf");
  });
});
