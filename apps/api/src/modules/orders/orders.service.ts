import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { UpdateOrderLogisticsDto } from "./dto/update-order-logistics.dto";
import { allowedTransitions } from "./order-status-transition-map";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateOrderDto) {
    await this.assertCustomerExists(dto.customerId);
    if (dto.opportunityId) {
      await this.assertOpportunityExists(dto.opportunityId);
    }
    if (dto.sourceQuoteId) {
      await this.assertQuoteExists(dto.sourceQuoteId);
    }
    if (dto.assignedLogisticsUserId) {
      await this.assertUserExists(dto.assignedLogisticsUserId);
    }

    const itemsWithSnapshot = await Promise.all(
      dto.items.map(async (item) => {
        if (item.productId) {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
          });
          if (!product) {
            throw new NotFoundException(`Product ${item.productId} not found`);
          }
          return {
            productId: item.productId,
            productSnapshotName: product.name,
            productSnapshotSku: product.sku,
            unit: product.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
            notes: item.notes,
          };
        }
        return {
          productId: null,
          productSnapshotName: "Custom item",
          productSnapshotSku: "CUSTOM",
          unit: "unit",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
          notes: item.notes,
        };
      }),
    );

    const subtotal = itemsWithSnapshot.reduce((sum, item) => sum + item.subtotal, 0);
    const total = subtotal;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: dto.customerId,
          opportunityId: dto.opportunityId || null,
          sourceQuoteId: dto.sourceQuoteId || null,
          requestedDeliveryDate: dto.requestedDeliveryDate
            ? new Date(dto.requestedDeliveryDate)
            : null,
          notes: dto.notes,
          assignedLogisticsUserId: dto.assignedLogisticsUserId || null,
          committedDeliveryDate: dto.committedDeliveryDate
            ? new Date(dto.committedDeliveryDate)
            : null,
          logisticsNotes: dto.logisticsNotes,
          subtotal,
          total,
          createdBy: user.id,
          updatedBy: user.id,
          items: {
            create: itemsWithSnapshot,
          },
        },
        include: { items: true, customer: true, opportunity: true, sourceQuote: true },
      });

      await this.auditService.record(
        {
          entityType: "Order",
          entityId: order.id,
          action: "order.created",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(order)),
        },
        tx,
      );

      return order;
    });
  }

  findAll(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: { customer: true, opportunity: true, items: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        opportunity: true,
        sourceQuote: true,
        items: true,
        billingRequests: true,
        assignedLogisticsUser: true,
      },
    });
  }

  async updateStatus(user: AuthUser, orderId: string, dto: UpdateOrderStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (!this.isTransitionAllowed(order.status, dto.status)) {
        throw new BadRequestException("Invalid order status transition");
      }

      const previousState = JSON.parse(JSON.stringify(order));

      const data: Parameters<typeof tx.order.update>[0]["data"] = {
        status: dto.status,
        updatedBy: user.id,
      };

      if (dto.status === "despachado") {
        data.dispatchDate = new Date();
      }
      if (dto.status === "entregado") {
        data.deliveryDate = new Date();
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data,
        include: { customer: true, opportunity: true, sourceQuote: true, items: true },
      });

      await this.auditService.record(
        {
          entityType: "Order",
          entityId: updated.id,
          action: "order.status_changed",
          actorUserId: user.id,
          previousState,
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      return updated;
    });
  }

  async updateLogistics(user: AuthUser, orderId: string, dto: UpdateOrderLogisticsDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (dto.assignedLogisticsUserId) {
        await this.assertUserExists(dto.assignedLogisticsUserId);
      }

      const previousState = JSON.parse(JSON.stringify(order));

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          assignedLogisticsUserId: dto.assignedLogisticsUserId || null,
          committedDeliveryDate: dto.committedDeliveryDate
            ? new Date(dto.committedDeliveryDate)
            : null,
          logisticsNotes: dto.logisticsNotes,
          updatedBy: user.id,
        },
        include: {
          customer: true,
          opportunity: true,
          sourceQuote: true,
          items: true,
          assignedLogisticsUser: true,
        },
      });

      await this.auditService.record(
        {
          entityType: "Order",
          entityId: updated.id,
          action: "order.logistics_updated",
          actorUserId: user.id,
          previousState,
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      return updated;
    });
  }

  async createBillingRequest(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.status !== "entregado" && order.status !== "facturado") {
      throw new BadRequestException("Billing request only allowed when order status is entregado or facturado");
    }

    return this.prisma.$transaction(async (tx) => {
      const billingRequest = await tx.billingRequest.create({
        data: {
          customerId: order.customerId,
          opportunityId: order.opportunityId,
          sourceType: "order",
          sourceOrderId: order.id,
          requestedByUserId: user.id,
          createdBy: user.id,
          updatedBy: user.id,
        },
        include: { customer: true, opportunity: true, sourceOrder: true },
      });

      await this.auditService.record(
        {
          entityType: "BillingRequest",
          entityId: billingRequest.id,
          action: "billing_request.created_from_order",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(billingRequest)),
        },
        tx,
      );

      return billingRequest;
    });
  }

  private async assertCustomerExists(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }

  private async assertOpportunityExists(opportunityId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) {
      throw new NotFoundException("Opportunity not found");
    }
  }

  private async assertQuoteExists(quoteId: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
  }

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
  }

  private isTransitionAllowed(currentStatus: OrderStatus, nextStatus: OrderStatus) {
    return allowedTransitions[currentStatus].includes(nextStatus);
  }
}
