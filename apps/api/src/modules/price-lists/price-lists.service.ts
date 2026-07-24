import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpsertPriceListItemDto } from "./dto/upsert-price-list-item.dto";

@Injectable()
export class PriceListsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Índice de listas. Muchas no tienen clientes asignados y eso es normal: las
   * de segmento/línea/país no se enganchan a un cliente único, y hay clientes
   * del Excel que todavía no existen en el CRM.
   */
  findAll(includeInactive = false) {
    return this.prisma.priceList.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true, customers: true } } },
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

  async upsertItem(id: string, dto: UpsertPriceListItemDto) {
    const [list, presentation] = await Promise.all([
      this.prisma.priceList.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.productPresentation.findUnique({
        where: { id: dto.presentationId },
        select: { id: true },
      }),
    ]);

    if (!list) {
      throw new NotFoundException("Lista de precios no encontrada");
    }
    if (!presentation) {
      throw new NotFoundException("Presentación no encontrada");
    }

    const { presentationId, ...prices } = dto;

    return this.prisma.priceListItem.upsert({
      where: { priceListId_presentationId: { priceListId: id, presentationId } },
      update: prices,
      create: { priceListId: id, presentationId, ...prices },
    });
  }
}
