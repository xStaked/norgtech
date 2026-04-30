import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    entityType: string;
    entityId: string;
    action: string;
    actorUserId: string;
    previousState?: Prisma.InputJsonValue;
    nextState?: Prisma.InputJsonValue;
  }) {
    return this.prisma.auditLog.create({ data: input });
  }

  findMany(filters: { entityType?: string; entityId?: string }) {
    return this.prisma.auditLog.findMany({
      where: {
        entityType: filters.entityType,
        entityId: filters.entityId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
