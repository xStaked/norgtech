import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BillingRequestStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { UpdateBillingStatusDto } from "./dto/update-billing-status.dto";
import { CreateBillingRequestDto } from "./dto/create-billing-request.dto";

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

  findAll(status?: BillingRequestStatus, companyId?: string) {
    const where: Prisma.BillingRequestWhereInput = {};
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    return this.prisma.billingRequest.findMany({
      where,
      include: { customer: true, opportunity: true, sourceQuote: true, sourceOrder: true, company: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(id: string) {
    return this.prisma.billingRequest.findUnique({
      where: { id },
      include: { customer: true, opportunity: true, sourceQuote: true, sourceOrder: true, company: true },
    });
  }

  async createDirect(user: AuthUser, dto: CreateBillingRequestDto) {
    if (dto.sourceOrderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.sourceOrderId } });
      if (!order) {
        throw new NotFoundException("Source order not found");
      }
      if (dto.customerId !== order.customerId) {
        throw new BadRequestException("Customer does not match source order");
      }
    }
    if (dto.sourceQuoteId) {
      const quote = await this.prisma.quote.findUnique({ where: { id: dto.sourceQuoteId } });
      if (!quote) {
        throw new NotFoundException("Source quote not found");
      }
      if (dto.customerId !== quote.customerId) {
        throw new BadRequestException("Customer does not match source quote");
      }
    }

    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }

    return this.prisma.$transaction(async (tx) => {
      const billingRequest = await tx.billingRequest.create({
        data: {
          customerId: dto.customerId,
          companyId: dto.companyId,
          opportunityId: dto.opportunityId || null,
          sourceType: dto.sourceOrderId ? "order" : dto.sourceQuoteId ? "quote" : "direct",
          sourceQuoteId: dto.sourceQuoteId || null,
          sourceOrderId: dto.sourceOrderId || null,
          notes: dto.notes,
          requestedByUserId: user.id,
          createdBy: user.id,
          updatedBy: user.id,
        },
        include: { customer: true, opportunity: true, sourceQuote: true, sourceOrder: true },
      });

      await this.auditService.record(
        {
          entityType: "BillingRequest",
          entityId: billingRequest.id,
          action: "billing_request.created_direct",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(billingRequest)),
        },
        tx,
      );

      return billingRequest;
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
