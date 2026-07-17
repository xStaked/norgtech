import { ConflictException, ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { WhatsAppService } from "../src/modules/whatsapp/whatsapp.service";

function makeService(overrides: Record<string, jest.Mock>) {
  const prisma = {
    whatsAppConversation: {
      findMany: overrides.findMany ?? jest.fn(),
      count: overrides.count ?? jest.fn(),
      findUnique: overrides.findUnique ?? jest.fn(),
      update: overrides.update ?? jest.fn(),
    },
    noraConversationCase: {
      findFirst: overrides.noraCaseFindFirst ?? jest.fn(),
    },
  };
  const ordersService = { create: overrides.ordersCreate ?? jest.fn() };
  const orderAutomation = { process: overrides.orderAutomationProcess ?? jest.fn() };
  const noraCaseService = { claimForExecution: overrides.claimForExecution ?? jest.fn() };
  const service = new WhatsAppService(
    prisma as any,
    ordersService as any,
    orderAutomation as any,
    noraCaseService as any,
  );
  return { service, prisma, ordersService, orderAutomation, noraCaseService };
}

const agent = { id: "u-tec", email: "t@n.co", role: UserRole.tecnico };
const supervisor = { id: "u-admin", email: "a@n.co", role: UserRole.administrador };

describe("unicanal por rol — WhatsAppService", () => {
  it("agente ve solo su rol", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = makeService({ findMany });
    await service.listConversations(agent as any);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ assignedToRole: UserRole.tecnico }, { assignedToUserId: "u-tec" }] },
      }),
    );
  });

  it("supervisor ve todo (where vacío)", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = makeService({ findMany });
    await service.listConversations(supervisor as any);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("pending-count cuenta pendientes sin tomar del rol propio", async () => {
    const count = jest.fn().mockResolvedValue(3);
    const { service } = makeService({ count });
    const res = await service.pendingCount(agent as any);
    expect(count).toHaveBeenCalledWith({
      where: { assignedToRole: UserRole.tecnico, status: "pendiente", assignedToUserId: null },
    });
    expect(res).toEqual({ count: 3 });
  });

  it("pending-count = 0 para supervisor sin consultar", async () => {
    const count = jest.fn();
    const { service } = makeService({ count });
    const res = await service.pendingCount(supervisor as any);
    expect(res).toEqual({ count: 0 });
    expect(count).not.toHaveBeenCalled();
  });

  it("tomar falla si la conversación es de otro rol", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.facturacion, assignedToUserId: null,
    });
    const { service } = makeService({ findUnique });
    await expect(service.claimConversation(agent as any, "c1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("tomar falla si ya la tomó otro", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.tecnico, assignedToUserId: "otro",
    });
    const { service } = makeService({ findUnique });
    await expect(service.claimConversation(agent as any, "c1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("tomar asigna al agente y pasa a en_gestion", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.tecnico, assignedToUserId: null,
    });
    const update = jest.fn().mockResolvedValue({ id: "c1" });
    const { service } = makeService({ findUnique, update });
    await service.claimConversation(agent as any, "c1");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: { assignedToUserId: "u-tec", status: "en_gestion" },
      }),
    );
  });

  it("sendMessage: agente de otro rol no puede escribir en la conversación", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.facturacion, assignedToUserId: null,
    });
    const update = jest.fn();
    const { service, prisma } = makeService({ findUnique, update });
    (prisma as any).whatsAppMessage = { create: jest.fn(), update: jest.fn() };
    await expect(
      service.sendMessage(agent as any, "c1", { body: "hola" } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
    expect((prisma as any).whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it("updateConversation: agente de otro rol no puede actualizar la conversación", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.facturacion, assignedToUserId: null,
    });
    const update = jest.fn();
    const { service } = makeService({ findUnique, update });
    await expect(
      service.updateConversation(agent as any, "c1", {} as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it("createNote: agente de otro rol no puede anotar la conversación", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.facturacion, assignedToUserId: null,
    });
    const { service, prisma } = makeService({ findUnique });
    (prisma as any).whatsAppInternalNote = { create: jest.fn() };
    await expect(
      service.createNote(agent as any, "c1", "nota"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((prisma as any).whatsAppInternalNote.create).not.toHaveBeenCalled();
  });

  it("createOrderDraft: agente de otro rol no puede crear la orden", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.facturacion, assignedToUserId: null,
    });
    const ordersCreate = jest.fn();
    const { service, ordersService } = makeService({ findUnique, ordersCreate });
    await expect(
      service.createOrderDraft(agent as any, "c1", {} as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ordersService.create).not.toHaveBeenCalled();
  });

  it("processOrderAutomation: agente de otro rol no puede procesar la automatización", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.facturacion, assignedToUserId: null,
    });
    const orderAutomationProcess = jest.fn();
    const { service, orderAutomation } = makeService({ findUnique, orderAutomationProcess });
    await expect(
      service.processOrderAutomation(agent as any, "c1", {} as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orderAutomation.process).not.toHaveBeenCalled();
  });

  it("createOrderFromCase: agente de otro rol no puede crear la orden desde el caso", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: UserRole.facturacion, assignedToUserId: null,
    });
    const noraCaseFindFirst = jest.fn();
    const claimForExecution = jest.fn();
    const { service, prisma, noraCaseService } = makeService({
      findUnique,
      noraCaseFindFirst,
      claimForExecution,
    });
    await expect(
      service.createOrderFromCase(agent as any, "c1", "case-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((prisma as any).noraConversationCase.findFirst).not.toHaveBeenCalled();
    expect(noraCaseService.claimForExecution).not.toHaveBeenCalled();
  });

  it("dueño: agente con assignedToUserId propio accede aunque el rol no coincida", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "c1", assignedToRole: null, assignedToUserId: "u-tec",
    });
    const { service } = makeService({ findUnique });
    await expect(service.getConversation(agent as any, "c1")).resolves.toBeTruthy();
  });
});
