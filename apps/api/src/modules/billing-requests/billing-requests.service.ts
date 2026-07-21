import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BillingRequestStatus, OrderStatus, Prisma } from "@prisma/client";
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
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

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

    if (customer.companyId !== dto.companyId) {
      throw new BadRequestException("Billing request company does not match customer company");
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

      // BILL-04: procesar una solicitud ligada a un pedido es lo que AVANZA ese
      // pedido a facturado. Se respeta el mismo mapa de transiciones que usa
      // OrdersService (orden_facturacion -> facturado). Es idempotente: si el
      // pedido ya esta facturado (p.ej. facturado por createInvoiceFromOrder),
      // se omite el avance en vez de reventar al reprocesar.
      if (dto.status === BillingRequestStatus.procesada && billingRequest.sourceOrderId) {
        await this.advanceSourceOrderToFacturado(user, billingRequest.sourceOrderId, tx);
      }

      return updated;
    });
  }

  private async advanceSourceOrderToFacturado(
    user: AuthUser,
    sourceOrderId: string,
    tx: Prisma.TransactionClient,
  ) {
    const order = await tx.order.findUnique({ where: { id: sourceOrderId } });
    // El mapa de transiciones solo permite facturado DESDE orden_facturacion
    // (order-status-transition-map: orden_facturacion -> facturado). Cualquier
    // otro estado significa que el pedido ya paso por ahi (facturado o mas
    // adelante) o que nunca estuvo listo: se omite en silencio. Procesar la
    // solicitud NUNCA debe reventar por donde quedo el pedido — bloquear al
    // back-office de facturacion es peor que no avanzar. Idempotente.
    if (!order || order.status !== OrderStatus.orden_facturacion) {
      return;
    }

    const previousState = JSON.parse(JSON.stringify(order));
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.facturado, updatedBy: user.id },
    });

    await this.auditService.record(
      {
        entityType: "Order",
        entityId: order.id,
        action: "order.status_changed",
        actorUserId: user.id,
        previousState,
        nextState: JSON.parse(JSON.stringify(updatedOrder)),
      },
      tx,
    );
  }

  private isStatusTransitionAllowed(
    currentStatus: BillingRequestStatus,
    nextStatus: BillingRequestStatus,
  ) {
    return allowedStatusTransitions[currentStatus].includes(nextStatus);
  }
}
