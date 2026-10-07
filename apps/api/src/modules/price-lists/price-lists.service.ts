import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PriceListStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { auditState } from "../audit/audit-state";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { ClonePriceListDto } from "./dto/clone-price-list.dto";
import { CreatePriceListDto } from "./dto/create-price-list.dto";
import { UpdatePriceListDto } from "./dto/update-price-list.dto";
import { UpsertPriceListItemDto } from "./dto/upsert-price-list-item.dto";

@Injectable()
export class PriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreatePriceListDto) {
    const name = dto.name.trim();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const list = await tx.priceList.create({
          data: {
            name,
            kind: dto.kind,
            currency: dto.currency,
            ...(dto.country?.trim() ? { country: dto.country.trim() } : {}),
            active: false,
            status: PriceListStatus.borrador,
          },
          include: { items: true, customers: true },
        });

        await this.auditService.record(
          {
            entityType: "PriceList",
            entityId: list.id,
            action: "price_list.created",
            actorUserId: user.id,
            nextState: auditState(list),
          },
          tx,
        );

        return list;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("Ya existe una lista con ese nombre");
      }
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdatePriceListDto) {
    const before = await this.prisma.priceList.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Lista de precios no encontrada");
    }

    const data = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.kind !== undefined && { kind: dto.kind }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.country !== undefined && { country: dto.country?.trim() || null }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.active === true && { status: PriceListStatus.aprobada }),
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Debes enviar al menos un campo para actualizar");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.priceList.update({
          where: { id },
          data,
          include: { items: true, customers: true },
        });
        await this.auditService.record(
          {
            entityType: "PriceList",
            entityId: id,
            action: dto.active === false ? "price_list.deactivated" : "price_list.updated",
            actorUserId: user.id,
            previousState: auditState(before),
            nextState: auditState(updated),
          },
          tx,
        );
        return updated;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("Ya existe una lista con ese nombre");
      }
      throw error;
    }
  }

  async clone(user: AuthUser, id: string, dto: ClonePriceListDto) {
    const source = await this.prisma.priceList.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!source) {
      throw new NotFoundException("Lista de precios no encontrada");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const clone = await tx.priceList.create({
          data: {
            name: dto.name.trim(),
            kind: source.kind,
            currency: source.currency,
            country: source.country,
            active: false,
            status: PriceListStatus.borrador,
            items: {
              create: source.items.map((item) => ({
                presentationId: item.presentationId,
                priceSinIva: item.priceSinIva,
                priceConIva: item.priceConIva,
                taxPercent: item.taxPercent,
                priceSinIva2: item.priceSinIva2,
                priceConIva2: item.priceConIva2,
                priceSinIva3: item.priceSinIva3,
                priceConIva3: item.priceConIva3,
              })),
            },
          },
          include: { items: true, customers: true },
        });

        await this.auditService.record(
          {
            entityType: "PriceList",
            entityId: clone.id,
            action: "price_list.cloned",
            actorUserId: user.id,
            previousState: auditState({ sourcePriceListId: source.id, name: source.name }),
            nextState: auditState(clone),
          },
          tx,
        );

        return clone;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("Ya existe una lista con ese nombre");
      }
      throw error;
    }
  }

  /**
   * Índice de listas. Muchas no tienen clientes asignados y eso es normal: las
   * de segmento/línea/país no se enganchan a un cliente único, y hay clientes
   * del Excel que todavía no existen en el CRM.
   */
  /**
   * Índice de listas. Trae los clientes enganchados porque el front muestra a
   * QUIÉN pertenece cada lista, no el nombre de la hoja del Excel: una lista
   * `cliente` sin cliente se ve como un comprador que no existe.
   */
  findAll(includeInactive = false) {
    return this.prisma.priceList.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { items: true, customers: true } },
        customers: {
          select: { id: true, displayName: true, currency: true, country: true },
          orderBy: { displayName: "asc" },
        },
      },
    });
  }

  async findOne(id: string) {
    const list = await this.prisma.priceList.findUnique({
      where: { id },
      include: {
        customers: {
          select: { id: true, displayName: true, taxId: true, country: true },
          orderBy: { displayName: "asc" },
        },
        items: {
          include: {
            presentation: {
              include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
            },
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException("Lista de precios no encontrada");
    }

    const { items, ...rest } = list;

    return {
      ...rest,
      items: items
        .map(({ presentation, ...item }) => ({
          ...item,
          empaque: presentation.empaque,
          form: presentation.form,
          dosage: presentation.dosage,
          product: presentation.product,
        }))
        .sort(
          (a, b) =>
            a.product.name.localeCompare(b.product.name) || a.empaque.localeCompare(b.empaque),
        ),
    };
  }

  async upsertItem(id: string, dto: UpsertPriceListItemDto, user: AuthUser) {
    const [list, presentation] = await Promise.all([
      this.prisma.priceList.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.productPresentation.findUnique({
        where: { id: dto.presentationId },
        select: { id: true, empaque: true },
      }),
    ]);

    if (!list) {
      throw new NotFoundException("Lista de precios no encontrada");
    }
    if (!presentation) {
      throw new NotFoundException("Presentación no encontrada");
    }

    const { presentationId, ...prices } = dto;

    // El antes se lee ANTES del upsert: es lo que el timeline muestra como
    // "precio anterior". Null = la presentación entra por primera vez.
    const before = await this.prisma.priceListItem.findUnique({
      where: { priceListId_presentationId: { priceListId: id, presentationId } },
    });

    // Decisión de atomicidad (final-review): upsert + auditoría van en la
    // misma $transaction. La auditoría corría después de un upsert suelto, así
    // que un fallo del audit dejaba el precio cambiado sin rastro (o el
    // timeline mentía sobre un precio que nunca se guardó). $transaction es
    // el patrón estándar del codebase para write+audit (orders, quotes,
    // invoices lo usan), así que se envuelve en vez de tragar el error.
    const item = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.priceListItem.upsert({
        where: { priceListId_presentationId: { priceListId: id, presentationId } },
        update: prices,
        create: { priceListId: id, presentationId, ...prices },
      });

      await this.auditService.record(
        {
          entityType: "PriceList",
          entityId: id,
          action: "price_list.item_upserted",
          actorUserId: user.id,
          previousState: auditState(
            before ? { ...priceSnapshot(before), empaque: presentation.empaque } : null,
          ),
          nextState: auditState({
            ...priceSnapshot(upserted),
            presentationId,
            empaque: presentation.empaque,
          }),
        },
        tx,
      );

      return upserted;
    });

    return item;
  }

  /**
   * Último precio VENDIDO a un cliente para un producto: el OrderItem más
   * reciente de sus pedidos reales. Las cotizaciones (QuoteItem, otra tabla)
   * nunca se leen aquí: cotizar no es vender.
   *
   * Decisión de alcance (final-review): NO se excluye ningún status. El enum
   * OrderStatus hoy es un flujo lineal sin cancelación ni anulación
   * (recibido → orden_facturacion → facturado → despachado → en_transito →
   * entregado), así que no hay pedidos cancelados que contaminen el "último
   * vendido". Si se agrega un status tipo cancelado/anulado, hay que
   * excluirlo en este where con un test que lo cubra.
   */
  async findLastSoldPrice(customerId: string, productId: string) {
    const item = await this.prisma.orderItem.findFirst({
      where: { productId, order: { customerId } },
      orderBy: { order: { orderDate: "desc" } },
      include: {
        order: { select: { orderNumber: true, orderDate: true, status: true } },
      },
    });

    if (!item) {
      return null;
    }

    return {
      customerId,
      productId,
      unitPrice: item.unitPrice,
      orderNumber: item.order.orderNumber,
      orderDate: item.order.orderDate,
      orderStatus: item.order.status,
    };
  }

  /**
   * Cierra la revisión de una lista especial: aprobada libera sus precios en
   * cotizaciones, rechazada los bloquea. Sin máquina de transiciones: la
   * revisión termina aquí, aprobada o rechazada.
   */
  async updateApproval(id: string, action: "aprobar" | "rechazar", user: AuthUser) {
    const list = await this.prisma.priceList.findUnique({ where: { id } });
    if (!list) {
      throw new NotFoundException("Lista de precios no encontrada");
    }

    const status: PriceListStatus =
      action === "aprobar" ? PriceListStatus.aprobada : PriceListStatus.rechazada;

    // Misma atomicidad que upsertItem: el cambio de estado y su rastro van
    // juntos o no van. Sin el record, una aprobación quedaba sin actor en el
    // timeline y no había forma de saber quién liberó los precios.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.priceList.update({ where: { id }, data: { status } });

      await this.auditService.record(
        {
          entityType: "PriceList",
          entityId: id,
          action: "price_list.approval_updated",
          actorUserId: user.id,
          previousState: auditState({ status: list.status }),
          nextState: auditState({ status }),
        },
        tx,
      );

      return updated;
    });
  }
}

/**
 * Lo único que el timeline necesita de un PriceListItem: los precios que el
 * cliente mandó tal cual (sin/con IVA + niveles 2/3 opcionales).
 */
function priceSnapshot(item: {
  priceSinIva: unknown;
  priceConIva: unknown;
  taxPercent: unknown;
  priceSinIva2: unknown;
  priceConIva2: unknown;
  priceSinIva3: unknown;
  priceConIva3: unknown;
}) {
  return {
    priceSinIva: item.priceSinIva,
    priceConIva: item.priceConIva,
    taxPercent: item.taxPercent,
    priceSinIva2: item.priceSinIva2,
    priceConIva2: item.priceConIva2,
    priceSinIva3: item.priceSinIva3,
    priceConIva3: item.priceConIva3,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
