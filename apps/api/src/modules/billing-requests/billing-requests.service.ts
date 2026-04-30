import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BillingRequestStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { UpdateBillingStatusDto } from "./dto/update-billing-status.dto";

const allowedStatusTransitions: Record<BillingRequestStatus, BillingRequestStatus[]> = {
  pendiente: ["procesada", "rechazada"],
  procesada: [],
  rechazada: [],
};

@Injectable()
export class BillingRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  findAll() {
    return this.prisma.billingRequest.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(id: string) {
    return this.prisma.billingRequest.findUnique({
      where: { id },
      include: { customer: true },
    });
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateBillingStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const billingRequest = await tx.billingRequest.findUnique({
        where: { id },
      });

      if (!billingRequest) {
        throw new NotFoundException("Billing request not found");
      }

      if (!this.isStatusTransitionAllowed(billingRequest.status, dto.status)) {
        throw new BadRequestException("Invalid billing request status transition");
      }

      const previousState = JSON.parse(JSON.stringify(billingRequest));

      const updated = await tx.billingRequest.update({
        where: { id },
        data: { status: dto.status, updatedBy: user.id },
      });

      await this.auditService.record(
        {
          entityType: "BillingRequest",
          entityId: updated.id,
          action: "billing_request.status_changed",
          actorUserId: user.id,
          previousState,
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      return updated;
    });
  }

  private isStatusTransitionAllowed(
    currentStatus: BillingRequestStatus,
    nextStatus: BillingRequestStatus,
  ) {
    return allowedStatusTransitions[currentStatus].includes(nextStatus);
  }
}
