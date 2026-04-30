import { Injectable } from "@nestjs/common";
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
}
