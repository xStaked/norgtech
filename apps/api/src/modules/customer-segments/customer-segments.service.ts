import { Injectable } from "@nestjs/common";
import { AuthUser } from "../auth/types/authenticated-request";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCustomerSegmentDto } from "./dto/create-customer-segment.dto";

@Injectable()
export class CustomerSegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: AuthUser, dto: CreateCustomerSegmentDto) {
    return this.prisma.customerSegment.create({
      data: {
        name: dto.name,
        description: dto.description,
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
}
