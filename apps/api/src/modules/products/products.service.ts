import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateProductDto } from "./dto/create-product.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: AuthUser, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        unit: dto.unit,
        presentation: dto.presentation,
        basePrice: dto.basePrice,
        active: dto.active ?? true,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
  }

  findAll() {
    return this.prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
  }

  findOne(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async getPriceForCustomer(productId: string, customerId: string) {
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

    const discountPercent = customer.segment?.discountPercent ?? new Prisma.Decimal(0);
    const discountMultiplier = new Prisma.Decimal(1).minus(
      new Prisma.Decimal(discountPercent).dividedBy(100),
    );
    const finalPrice = new Prisma.Decimal(product.basePrice).times(discountMultiplier).toDecimalPlaces(2);

    return {
      productId,
      customerId,
      basePrice: product.basePrice,
      discountPercent,
      finalPrice,
    };
  }
}
