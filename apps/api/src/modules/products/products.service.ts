import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { PricingService } from "../pricing/pricing.service";
import { CreateProductDto } from "./dto/create-product.dto";

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
          basePrice: dto.basePrice,
          active: dto.active ?? true,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Ya existe un producto con ese SKU");
      }

      throw error;
    }
  }

  findAll(includeInactive = false) {
    return this.prisma.product.findMany({
      where: includeInactive ? undefined : { active: true },
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

    // Must go through PricingService: the segment discount is conditional on
    // the customer meeting their goal, so applying it raw here would quote a
    // price the order would not honor.
    const { discountPercent, meetsGoal, salesYTD, goalThreshold } =
      await this.pricingService.resolveSegmentDiscount(customer);

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
      meetsGoal,
      salesYTD,
      goalThreshold,
    };
  }

  private isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
