import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuthUser } from "../auth/types/authenticated-request";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCustomerSegmentDto } from "./dto/create-customer-segment.dto";
import { UpdateCustomerSegmentDto } from "./dto/update-customer-segment.dto";

@Injectable()
export class CustomerSegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private validateGoalRange(dto: {
    minGoalAmount?: number;
    maxGoalAmount?: number | null;
  }) {
    if (
      dto.maxGoalAmount !== undefined &&
      dto.maxGoalAmount !== null &&
      dto.minGoalAmount !== undefined &&
      dto.maxGoalAmount <= dto.minGoalAmount
    ) {
      throw new BadRequestException(
        "maxGoalAmount must be greater than minGoalAmount",
      );
    }
  }

  create(user: AuthUser, dto: CreateCustomerSegmentDto) {
    this.validateGoalRange(dto);

    return this.prisma.customerSegment.create({
      data: {
        name: dto.name,
        description: dto.description,
        discountPercent: dto.discountPercent ?? 0,
        minGoalAmount: dto.minGoalAmount,
        maxGoalAmount: dto.maxGoalAmount ?? null,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
  }

  findAll() {
    return this.prisma.customerSegment.findMany({
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id },
    });

    if (!segment) {
      throw new NotFoundException("Customer segment not found");
    }

    return segment;
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomerSegmentDto) {
    await this.findOne(id);
    this.validateGoalRange(dto);

    return this.prisma.customerSegment.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        discountPercent: dto.discountPercent,
        minGoalAmount: dto.minGoalAmount,
        maxGoalAmount: dto.maxGoalAmount,
        updatedBy: user.id,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const customersCount = await this.prisma.customer.count({
      where: { segmentId: id },
    });

    if (customersCount > 0) {
      throw new BadRequestException(
        "Cannot delete segment with assigned customers",
      );
    }

    return this.prisma.customerSegment.delete({
      where: { id },
    });
  }
}
