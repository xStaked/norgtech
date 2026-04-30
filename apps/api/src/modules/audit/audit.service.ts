import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type AuditWriter = Pick<PrismaService, "auditLog"> | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    input: {
      entityType: string;
      entityId: string;
      action: string;
      actorUserId: string;
      previousState?: Prisma.InputJsonValue;
      nextState?: Prisma.InputJsonValue;
    },
    writer: AuditWriter = this.prisma,
  ) {
    return writer.auditLog.create({ data: input });
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
