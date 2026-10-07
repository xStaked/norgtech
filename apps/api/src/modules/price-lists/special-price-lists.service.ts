import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { auditState } from "../audit/audit-state";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateSpecialPriceListDto } from "./dto/create-special-price-list.dto";

const SUPPORTED_CURRENCIES = new Set(["COP", "USD"]);

@Injectable()
export class SpecialPriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateSpecialPriceListDto) {
    const customerIds = [...new Set(dto.items.map((item) => item.customerId))];
    const presentationIds = [...new Set(dto.items.map((item) => item.presentationId))];
    const combinations = new Set<string>();

    for (const item of dto.items) {
      const key = `${item.customerId}\u0000${item.presentationId}`;
      if (combinations.has(key)) {
        throw new BadRequestException("La lista repite un cliente y presentación");
      }
      combinations.add(key);
      if (
        item.priceSinIva === undefined &&
        item.priceConIva === undefined
      ) {
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
    const presentationsById = new Set(presentations.map((presentation) => presentation.id));

    for (const customerId of customerIds) {
      const customer = customersById.get(customerId);
      if (!customer) {
        throw new NotFoundException("Cliente no encontrado o inactivo");
      }
      if (!SUPPORTED_CURRENCIES.has(customer.currency)) {
        throw new BadRequestException(`Divisa no soportada para ${customer.displayName}`);
      }
      if (user.role === UserRole.comercial && customer.assignedToUserId !== user.id) {
        throw new ForbiddenException("Solo puedes cargar precios especiales para tus clientes");
      }
    }

    for (const presentationId of presentationIds) {
      if (!presentationsById.has(presentationId)) {
        throw new NotFoundException("Presentación no encontrada o inactiva");
      }
    }

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
}
