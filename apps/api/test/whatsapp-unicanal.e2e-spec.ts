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
  };
  const service = new WhatsAppService(prisma as any, {} as any, {} as any, {} as any);
  return { service, prisma };
}

const agent = { id: "u-tec", email: "t@n.co", role: UserRole.tecnico };
const supervisor = { id: "u-admin", email: "a@n.co", role: UserRole.administrador };

describe("unicanal por rol — WhatsAppService", () => {
  it("agente ve solo su rol", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = makeService({ findMany });
    await service.listConversations(agent as any);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignedToRole: UserRole.tecnico } }),
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
});
