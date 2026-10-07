import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PriceListStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { auditState } from "../audit/audit-state";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { ApprovalPriceListDto } from "./dto/approval-price-list.dto";
import { CreateSpecialPriceListDto } from "./dto/create-special-price-list.dto";
import { CreateSpecialPriceListItemDto } from "./dto/create-special-price-list-item.dto";
import { UpdateSpecialPriceListDto } from "./dto/update-special-price-list.dto";
import { UpdateSpecialPriceListRevisionDto } from "./dto/update-special-price-list-revision.dto";

const SUPPORTED_CURRENCIES = new Set(["COP", "USD"]);

@Injectable()
export class SpecialPriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateSpecialPriceListDto) {
    const { customerIds } = await this.validateItems(user.id, user.role, dto.items);

    const name = dto.name.trim();
    return this.prisma.$transaction(async (tx) => {
      const list = await tx.specialPriceList.create({
        data: {
          name,
          owner: { connect: { id: user.id } },
          revisions: {
            create: {
              revision: 1,
              status: "en_revision",
              active: false,
              createdBy: { connect: { id: user.id } },
              customers: {
                create: customerIds.map((customerId) => ({
                  customer: { connect: { id: customerId } },
                })),
              },
              items: {
                create: dto.items.map(({ customerId, presentationId, ...prices }) => ({
                  owner: { connect: { id: user.id } },
                  customer: { connect: { id: customerId } },
                  presentation: { connect: { id: presentationId } },
                  ...prices,
                })),
              },
            },
          },
        },
        include: {
          revisions: {
            include: {
              customers: {
                include: { customer: { select: { id: true, displayName: true, currency: true } } },
                orderBy: { customer: { displayName: "asc" } },
              },
              items: {
                include: {
                  customer: { select: { id: true, displayName: true, currency: true } },
                  presentation: {
                    select: { id: true, empaque: true, form: true, dosage: true },
                  },
                },
                orderBy: [{ customer: { displayName: "asc" } }, { presentation: { empaque: "asc" } }],
              },
            },
          },
        },
      });

      await this.auditService.record(
        {
          entityType: "SpecialPriceList",
          entityId: list.id,
          action: "special_price_list.submitted",
          actorUserId: user.id,
          nextState: auditState({
            name: list.name,
            ownerUserId: list.ownerUserId,
            revision: 1,
            status: "en_revision",
            customerIds,
            itemCount: dto.items.length,
          }),
        },
        tx,
      );

      return list;
    });
  }

  findAll(user: AuthUser) {
    return this.prisma.specialPriceList.findMany({
      where: user.role === UserRole.comercial ? { ownerUserId: user.id } : undefined,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      include: specialPriceListInclude,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const list = await this.prisma.specialPriceList.findUnique({
      where: { id },
      include: specialPriceListInclude,
    });
    if (!list) {
      throw new NotFoundException("Lista especial no encontrada");
    }
    this.assertCanAccess(user, list);
    return list;
  }

  async updateList(user: AuthUser, id: string, dto: UpdateSpecialPriceListDto) {
    const before = await this.findOne(user, id);
    this.assertCanManage(user);
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw new BadRequestException("El nombre de la lista es obligatorio");
    }
    if (name === undefined && dto.active === undefined) {
      throw new BadRequestException("Debes enviar nombre o estado para actualizar");
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.active === false) {
        const activeRevisions = await tx.specialPriceListRevision.findMany({
          where: { specialPriceListId: id, active: true },
          select: { id: true },
        });
        for (const revision of activeRevisions) {
          await tx.specialPriceListItem.updateMany({
            where: { revisionId: revision.id },
            data: { active: false },
          });
        }
      }

      if (dto.active === true) {
        const activeRevision = await tx.specialPriceListRevision.findFirst({
          where: { specialPriceListId: id, active: true },
          include: { items: true },
        });
        if (activeRevision) {
          for (const item of activeRevision.items) {
            const conflicts = await tx.specialPriceListItem.findMany({
              where: {
                ownerUserId: before.ownerUserId,
                customerId: item.customerId,
                presentationId: item.presentationId,
                active: true,
              },
              select: { id: true, revisionId: true },
            });
            if (conflicts.some((row) => row.revisionId !== activeRevision.id)) {
              throw new ConflictException("Otro precio especial activo ya cubre ese cliente y presentación");
            }
          }
          await tx.specialPriceListItem.updateMany({
            where: { revisionId: activeRevision.id },
            data: { active: true },
          });
        }
      }

      const updated = await tx.specialPriceList.update({
        where: { id },
        data: { ...(name !== undefined && { name }), ...(dto.active !== undefined && { active: dto.active }) },
      });
      await this.auditService.record(
        {
          entityType: "SpecialPriceList",
          entityId: id,
          action:
            dto.active === false
              ? "special_price_list.deactivated"
              : dto.active === true
                ? "special_price_list.reactivated"
                : "special_price_list.updated",
          actorUserId: user.id,
          previousState: auditState({ name: before.name, active: before.active }),
          nextState: auditState({ name: updated.name, active: updated.active, ownerUserId: updated.ownerUserId }),
        },
        tx,
      );
      return updated;
    });
  }

  async createRevision(user: AuthUser, id: string) {
    const list = await this.findOne(user, id);
    const activeRevision = list.revisions.find((revision) => revision.active);
    if (!activeRevision) {
      throw new BadRequestException("La lista no tiene una revisión aprobada para modificar");
    }

    const revision = await this.prisma.$transaction(async (tx) => {
      const created = await tx.specialPriceListRevision.create({
        data: {
          specialPriceListId: id,
          revision: activeRevision.revision + 1,
          status: PriceListStatus.borrador,
          active: false,
          createdByUserId: user.id,
        },
      });
      await tx.specialPriceListCustomer.createMany({
        data: activeRevision.customers.map((membership) => ({
          revisionId: created.id,
          customerId: membership.customerId,
        })),
      });
      await tx.specialPriceListItem.createMany({
        data: activeRevision.items.map((item) => ({
          revisionId: created.id,
          ownerUserId: list.ownerUserId,
          customerId: item.customerId,
          presentationId: item.presentationId,
          active: false,
          priceSinIva: item.priceSinIva,
          priceConIva: item.priceConIva,
          taxPercent: item.taxPercent,
        })),
      });
      await this.auditService.record(
        {
          entityType: "SpecialPriceList",
          entityId: id,
          action: "special_price_list.revision_created",
          actorUserId: user.id,
          previousState: auditState({ activeRevision: activeRevision.revision }),
          nextState: auditState({ revision: created.revision, status: created.status }),
        },
        tx,
      );
      return created;
    });

    return this.findRevision(id, revision.id);
  }

  async updateRevision(
    user: AuthUser,
    listId: string,
    revisionId: string,
    dto: UpdateSpecialPriceListRevisionDto,
  ) {
    const list = await this.findOne(user, listId);
    const revision = await this.prisma.specialPriceListRevision.findUnique({
      where: { id: revisionId },
      include: { items: true },
    });
    if (!revision || revision.specialPriceListId !== listId) {
      throw new NotFoundException("Revisión de lista especial no encontrada");
    }
    if (revision.active || revision.status === PriceListStatus.aprobada) {
      throw new BadRequestException("Una revisión aprobada se modifica creando una nueva revisión");
    }
    const editableStatus =
      revision.status === PriceListStatus.borrador || revision.status === PriceListStatus.rechazada;
    if (user.role === UserRole.comercial && !editableStatus) {
      throw new BadRequestException("Solo puedes corregir borradores o revisiones rechazadas");
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: list.ownerUserId },
      select: { role: true },
    });
    if (!owner) {
      throw new NotFoundException("Propietario de la lista no encontrado");
    }
    const { customerIds } = await this.validateItems(list.ownerUserId, owner.role, dto.items);
    const previousState = auditState({
      status: revision.status,
      items: revision.items.map(specialPriceSnapshot),
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.specialPriceListItem.deleteMany({ where: { revisionId } });
      await tx.specialPriceListCustomer.deleteMany({ where: { revisionId } });
      await tx.specialPriceListCustomer.createMany({
        data: customerIds.map((customerId) => ({ revisionId, customerId })),
      });
      await tx.specialPriceListItem.createMany({
        data: dto.items.map(({ customerId, presentationId, ...prices }) => ({
          revisionId,
          ownerUserId: list.ownerUserId,
          customerId,
          presentationId,
          active: false,
          ...prices,
        })),
      });
      await this.auditService.record(
        {
          entityType: "SpecialPriceList",
          entityId: listId,
          action: "special_price_list.revision_edited",
          actorUserId: user.id,
          previousState,
          nextState: auditState({ revision: revision.revision, status: revision.status, items: dto.items }),
        },
        tx,
      );
    });

    return this.findRevision(listId, revisionId);
  }

  async submitRevision(user: AuthUser, listId: string, revisionId: string) {
    const list = await this.findOne(user, listId);
    const revision = await this.requireRevision(listId, revisionId);
    const submittableStatus =
      revision.status === PriceListStatus.borrador || revision.status === PriceListStatus.rechazada;
    if (revision.active || !submittableStatus) {
      throw new BadRequestException("Solo puedes enviar borradores o revisiones rechazadas");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const submitted = await tx.specialPriceListRevision.update({
        where: { id: revisionId },
        data: {
          status: PriceListStatus.en_revision,
          reviewedByUserId: null,
          rejectionReason: null,
          active: false,
        },
      });
      await this.auditService.record(
        {
          entityType: "SpecialPriceList",
          entityId: listId,
          action: "special_price_list.submitted",
          actorUserId: user.id,
          previousState: auditState({ status: revision.status, revision: revision.revision }),
          nextState: auditState({ status: submitted.status, revision: submitted.revision }),
        },
        tx,
      );
      return submitted;
    });

    return this.findRevision(list.id, updated.id);
  }

  async updateApproval(
    user: AuthUser,
    listId: string,
    revisionId: string,
    action: ApprovalPriceListDto["action"],
  ) {
    const list = await this.prisma.specialPriceList.findUnique({ where: { id: listId } });
    if (!list) {
      throw new NotFoundException("Lista especial no encontrada");
    }
    const revision = await this.requireRevision(listId, revisionId);
    if (revision.status !== PriceListStatus.en_revision) {
      throw new BadRequestException("Solo se pueden revisar listas enviadas");
    }

    const status = action === "aprobar" ? PriceListStatus.aprobada : PriceListStatus.rechazada;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (action === "aprobar") {
        const previousActive = await tx.specialPriceListRevision.findFirst({
          where: { specialPriceListId: listId, active: true },
          select: { id: true },
        });
        if (previousActive) {
          await tx.specialPriceListItem.updateMany({
            where: { revisionId: previousActive.id },
            data: { active: false },
          });
        }
        await tx.specialPriceListRevision.updateMany({
          where: { specialPriceListId: listId, active: true },
          data: { active: false },
        });

        const items = await tx.specialPriceListItem.findMany({ where: { revisionId } });
        for (const item of items) {
          await tx.specialPriceListItem.updateMany({
            where: {
              ownerUserId: list.ownerUserId,
              customerId: item.customerId,
              presentationId: item.presentationId,
              active: true,
            },
            data: { active: false },
          });
        }
        await tx.specialPriceListItem.updateMany({ where: { revisionId }, data: { active: true } });
        await tx.specialPriceList.update({ where: { id: listId }, data: { active: true } });
      }

      const reviewed = await tx.specialPriceListRevision.update({
        where: { id: revisionId },
        data: { status, active: action === "aprobar", reviewedByUserId: user.id },
      });
      await this.auditService.record(
        {
          entityType: "SpecialPriceList",
          entityId: listId,
          action: "special_price_list.approval_updated",
          actorUserId: user.id,
          previousState: auditState({ status: revision.status, active: revision.active }),
          nextState: auditState({ status: reviewed.status, active: reviewed.active }),
        },
        tx,
      );
      return reviewed;
    });

    return this.findRevision(listId, updated.id);
  }

  private async requireRevision(listId: string, revisionId: string) {
    const revision = await this.prisma.specialPriceListRevision.findUnique({ where: { id: revisionId } });
    if (!revision || revision.specialPriceListId !== listId) {
      throw new NotFoundException("Revisión de lista especial no encontrada");
    }
    return revision;
  }

  private async findRevision(listId: string, revisionId: string) {
    await this.requireRevision(listId, revisionId);
    const list = await this.prisma.specialPriceList.findUnique({
      where: { id: listId },
      include: specialPriceListInclude,
    });
    return list?.revisions.find((revision) => revision.id === revisionId) ?? null;
  }

  private assertCanAccess(user: AuthUser, list: { ownerUserId: string }) {
    const canManage = this.isManager(user);
    if (!canManage && !(user.role === UserRole.comercial && list.ownerUserId === user.id)) {
      throw new ForbiddenException("No tienes acceso a esta lista especial");
    }
  }

  private assertCanManage(user: AuthUser) {
    if (!this.isManager(user)) {
      throw new ForbiddenException("No puedes administrar los datos de esta lista especial");
    }
  }

  private isManager(user: AuthUser) {
    return (
      user.role === UserRole.administrador ||
      user.role === UserRole.director_comercial ||
      user.role === UserRole.promotor
    );
  }

  private async validateItems(
    ownerUserId: string,
    ownerRole: UserRole,
    items: CreateSpecialPriceListItemDto[],
  ) {
    const customerIds = [...new Set(items.map((item) => item.customerId))];
    const presentationIds = [...new Set(items.map((item) => item.presentationId))];
    const combinations = new Set<string>();

    for (const item of items) {
      const key = `${item.customerId}\u0000${item.presentationId}`;
      if (combinations.has(key)) {
        throw new BadRequestException("La lista repite un cliente y presentación");
      }
      combinations.add(key);
      if (item.priceSinIva === undefined && item.priceConIva === undefined) {
        throw new BadRequestException("Cada fila requiere un precio sin IVA o con IVA");
      }
    }

    const [customers, presentations] = await Promise.all([
      this.prisma.customer.findMany({
        where: { id: { in: customerIds }, active: true },
        select: { id: true, displayName: true, currency: true, assignedToUserId: true },
      }),
      this.prisma.productPresentation.findMany({
        where: { id: { in: presentationIds }, active: true },
        select: { id: true },
      }),
    ]);
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const foundPresentations = new Set(presentations.map((presentation) => presentation.id));

    for (const customerId of customerIds) {
      const customer = customersById.get(customerId);
      if (!customer) throw new NotFoundException("Cliente no encontrado o inactivo");
      if (!SUPPORTED_CURRENCIES.has(customer.currency)) {
        throw new BadRequestException(`Divisa no soportada para ${customer.displayName}`);
      }
      if (ownerRole === UserRole.comercial && customer.assignedToUserId !== ownerUserId) {
        throw new ForbiddenException("La lista solo puede contener clientes del comercial propietario");
      }
    }
    for (const presentationId of presentationIds) {
      if (!foundPresentations.has(presentationId)) {
        throw new NotFoundException("Presentación no encontrada o inactiva");
      }
    }
    return { customerIds };
  }
}

function specialPriceSnapshot(item: {
  customerId: string;
  presentationId: string;
  priceSinIva: unknown;
  priceConIva: unknown;
  taxPercent: unknown;
}) {
  return {
    customerId: item.customerId,
    presentationId: item.presentationId,
    priceSinIva: item.priceSinIva,
    priceConIva: item.priceConIva,
    taxPercent: item.taxPercent,
  };
}

const specialPriceListInclude = {
  revisions: {
    orderBy: { revision: "desc" as const },
    include: {
      customers: {
        include: { customer: { select: { id: true, displayName: true, currency: true } } },
        orderBy: { customer: { displayName: "asc" as const } },
      },
      items: {
        include: {
          customer: { select: { id: true, displayName: true, currency: true } },
          presentation: { select: { id: true, empaque: true, form: true, dosage: true } },
        },
        orderBy: [{ customer: { displayName: "asc" as const } }, { presentation: { empaque: "asc" as const } }],
      },
    },
  },
};
