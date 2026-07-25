import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { PricingService } from "../pricing/pricing.service";
import { CreateProductDto } from "./dto/create-product.dto";
import {
  CreateProductPresentationDto,
  UpdateProductPresentationDto,
} from "./dto/product-presentation.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

/** Rango de precio de un producto dentro de una moneda. */
interface PriceRange {
  min: number;
  max: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  async create(user: AuthUser, dto: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: {
          sku: dto.sku,
          name: dto.name,
          description: dto.description,
          unit: dto.unit,
          presentation: dto.presentation,
          basePrice: dto.basePrice ?? 0,
          active: dto.active ?? true,
          createdBy: user.id,
          updatedBy: user.id,
          presentations: dto.presentations?.length
            ? {
                create: dto.presentations.map((p) => ({
                  empaque: p.empaque,
                  form: p.form,
                  dosage: p.dosage,
                  active: p.active ?? true,
                })),
              }
            : undefined,
        },
        include: { presentations: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Ya existe un producto con ese SKU");
      }

      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateProductDto) {
    await this.requireProduct(id);

    return this.prisma.product.update({
      where: { id },
      data: { ...dto, updatedBy: user.id },
      include: { presentations: true },
    });
  }

  /**
   * Lista con lo que la pantalla de catálogo necesita mostrar: cuántas
   * presentaciones tiene, en cuántas listas tiene precio, y el rango de precio
   * por moneda. No devuelve un precio único: el mismo producto vale distinto en
   * cada lista, y `basePrice` es vestigial.
   *
   * ponytail: el rango se calcula en memoria sobre el include anidado. Son 53
   * productos y 772 ítems; si el catálogo crece a miles, pasarlo a SQL agregado.
   */
  async findAll(includeInactive = false, customerId?: string) {
    // Un cliente compra por su lista de precios: filtrar "por cliente" es
    // quedarse con los productos que tienen precio en esa lista.
    let priceListId: string | undefined;
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { priceListId: true },
      });
      if (!customer) {
        throw new NotFoundException("Customer not found");
      }
      if (!customer.priceListId) return [];
      priceListId = customer.priceListId;
    }

    const products = await this.prisma.product.findMany({
      where: {
        ...(includeInactive ? undefined : { active: true }),
        ...(priceListId && {
          presentations: { some: { priceItems: { some: { priceListId } } } },
        }),
      },
      orderBy: { name: "asc" },
      include: {
        presentations: {
          where: includeInactive ? undefined : { active: true },
          include: {
            priceItems: {
              include: { priceList: { select: { id: true, currency: true, active: true } } },
            },
          },
        },
      },
    });

    return products.map(({ presentations, ...product }) => {
      // Filtrando por cliente, el rango es el de SU lista: mezclarlo con el
      // resto de listas mostraria un precio que ese cliente no paga.
      const items = presentations.flatMap((p) =>
        p.priceItems.filter(
          (i) => i.priceList.active && (!priceListId || i.priceListId === priceListId),
        ),
      );

      return {
        ...product,
        presentationCount: presentations.length,
        priceListCount: new Set(items.map((i) => i.priceList.id)).size,
        priceRange: this.priceRangesByCurrency(items),
      };
    });
  }

  /**
   * Detalle: el producto, sus presentaciones, y la matriz presentación × lista.
   * `priceLists` son las columnas — solo las listas donde este producto tiene
   * algún precio, no las 19.
   */
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        presentations: {
          orderBy: { empaque: "asc" },
          include: {
            priceItems: {
              include: {
                priceList: {
                  select: {
                    id: true,
                    name: true,
                    kind: true,
                    currency: true,
                    country: true,
                    active: true,
                    // La matriz muestra a QUIÉN pertenece cada columna. Sin
                    // esto, una lista de cliente se ve como un comprador
                    // inventado en vez de con su nombre real.
                    customers: {
                      select: { id: true, displayName: true, currency: true, country: true },
                      orderBy: { displayName: "asc" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException("Producto no encontrado");
    }

    const { presentations, ...rest } = product;
    const columns = new Map<string, (typeof presentations)[number]["priceItems"][number]["priceList"]>();

    const withPrices = presentations.map(({ priceItems, ...presentation }) => ({
      ...presentation,
      prices: priceItems.map((item) => {
        columns.set(item.priceList.id, item.priceList);
        const { priceListId, presentationId, priceList, id: itemId, ...prices } = item;
        return {
          id: itemId,
          priceListId,
          priceListName: priceList.name,
          kind: priceList.kind,
          currency: priceList.currency,
          country: priceList.country,
          ...prices,
        };
      }),
    }));

    return {
      ...rest,
      presentations: withPrices,
      priceLists: [...columns.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async addPresentation(id: string, dto: CreateProductPresentationDto) {
    await this.requireProduct(id);

    try {
      return await this.prisma.productPresentation.create({
        data: {
          productId: id,
          empaque: dto.empaque,
          form: dto.form,
          dosage: dto.dosage,
          active: dto.active ?? true,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("El producto ya tiene una presentación con ese empaque");
      }

      throw error;
    }
  }

  async updatePresentation(presentationId: string, dto: UpdateProductPresentationDto) {
    const presentation = await this.prisma.productPresentation.findUnique({
      where: { id: presentationId },
    });
    if (!presentation) {
      throw new NotFoundException("Presentación no encontrada");
    }

    try {
      return await this.prisma.productPresentation.update({
        where: { id: presentationId },
        data: dto,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("El producto ya tiene una presentación con ese empaque");
      }

      throw error;
    }
  }

  async getPriceForCustomer(productId: string, customerId: string, presentationId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { segment: true },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return this.pricingService.resolvePrice(customer, product, presentationId);
  }

  private async requireProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) {
      throw new NotFoundException("Producto no encontrado");
    }
    return product;
  }

  /**
   * COP y USD nunca se mezclan: no hay tasa de cambio en el sistema, así que un
   * rango que sumara ambas monedas sería un número inventado.
   */
  private priceRangesByCurrency(
    items: { priceSinIva: Prisma.Decimal | null; priceList: { currency: string } }[],
  ): Record<string, PriceRange> {
    const ranges: Record<string, PriceRange> = {};

    for (const item of items) {
      if (item.priceSinIva === null) continue;
      const value = item.priceSinIva.toNumber();
      const current = ranges[item.priceList.currency];
      ranges[item.priceList.currency] = current
        ? { min: Math.min(current.min, value), max: Math.max(current.max, value) }
        : { min: value, max: value };
    }

    return ranges;
  }

  private isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
