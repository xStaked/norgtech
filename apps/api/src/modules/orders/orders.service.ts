import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { UpdateOrderLogisticsDto } from "./dto/update-order-logistics.dto";
import { OrderXlsxExportService } from "./order-xlsx-export.service";
import { allowedTransitions } from "./order-status-transition-map";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orderXlsxExportService: OrderXlsxExportService,
  ) {}

  async create(user: AuthUser, dto: CreateOrderDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      include: { segment: true },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    if (dto.opportunityId) {
      await this.assertOpportunityBelongsToCustomer(dto.opportunityId, dto.customerId);
    }
    if (dto.sourceQuoteId) {
      await this.assertQuoteBelongsToCustomer(dto.sourceQuoteId, dto.customerId);
    }
    if (dto.sourceConversationId) {
      await this.assertConversationBelongsToCustomer(dto.sourceConversationId, dto.customerId);
    }
    if (dto.assignedLogisticsUserId) {
      await this.assertUserExists(dto.assignedLogisticsUserId);
    }

    const discountPercent = customer.segment?.discountPercent ?? new Prisma.Decimal(0);
    const orderNumber = dto.orderNumber?.trim() || await this.nextOrderNumber();
    const orderDate = dto.orderDate ? new Date(dto.orderDate) : new Date();
    const customerNameSnapshot = customer.displayName;
    const customerNitSnapshot = customer.taxId ?? null;
    const dispatchAddressSnapshot =
      dto.dispatchAddressSnapshot?.trim() || customer.address || null;
    const preparedByName =
      dto.preparedByName ||
      (await this.prisma.user.findUnique({ where: { id: user.id } }))?.name ||
      user.email;

    const itemsWithSnapshot = await Promise.all(
      dto.items.map(async (item) => {
        const taxPercent = new Prisma.Decimal(item.taxPercent ?? 19).toDecimalPlaces(2);

        if (item.productId) {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
          });
          if (!product) {
            throw new NotFoundException(`Product ${item.productId} not found`);
          }
          const discountMultiplier = new Prisma.Decimal(1).minus(
            new Prisma.Decimal(discountPercent).dividedBy(100),
          );
          const unitPriceRounded = new Prisma.Decimal(product.basePrice)
            .times(discountMultiplier)
            .toDecimalPlaces(2);
          const taxAmount = unitPriceRounded.times(taxPercent).dividedBy(100).toDecimalPlaces(2);
          const subtotal = new Prisma.Decimal(item.quantity).times(unitPriceRounded).toDecimalPlaces(2);
          const totalWithTax = new Prisma.Decimal(item.quantity)
            .times(unitPriceRounded.plus(taxAmount))
            .toDecimalPlaces(2);

          return {
            productId: item.productId,
            productSnapshotName: product.name,
            productSnapshotSku: product.sku,
            unit: product.unit,
            presentationSnapshot: item.presentation?.trim() || product.presentation || null,
            customProductName: null,
            quantity: item.quantity,
            originalUnitPrice: product.basePrice,
            discountPercent,
            unitPrice: unitPriceRounded,
            taxPercent,
            taxAmount,
            totalWithTax,
            subtotal,
            notes: item.notes,
          };
        }
        const customProductName = item.productName?.trim() || null;
        const presentationSnapshot = item.presentation?.trim() || null;
        const unitPriceRounded = new Prisma.Decimal(item.unitPrice).toDecimalPlaces(2);
        const taxAmount = unitPriceRounded.times(taxPercent).dividedBy(100).toDecimalPlaces(2);
        const subtotal = new Prisma.Decimal(item.quantity).times(unitPriceRounded).toDecimalPlaces(2);
        const totalWithTax = new Prisma.Decimal(item.quantity)
          .times(unitPriceRounded.plus(taxAmount))
          .toDecimalPlaces(2);

        return {
          productId: null,
          productSnapshotName: customProductName || "Custom item",
          productSnapshotSku: "CUSTOM",
          unit: "unit",
          presentationSnapshot,
          customProductName,
          quantity: item.quantity,
          originalUnitPrice: null,
          discountPercent: null,
          unitPrice: unitPriceRounded,
          taxPercent,
          taxAmount,
          totalWithTax,
          subtotal,
          notes: item.notes,
        };
      }),
    );

    const subtotal = itemsWithSnapshot.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.subtotal)),
      new Prisma.Decimal(0),
    );
    const total = itemsWithSnapshot.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.totalWithTax)),
      new Prisma.Decimal(0),
    );

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: dto.customerId,
          opportunityId: dto.opportunityId || null,
          sourceQuoteId: dto.sourceQuoteId || null,
          sourceConversationId: dto.sourceConversationId || null,
          orderNumber,
          purchaseOrderNumber: dto.purchaseOrderNumber || null,
          orderDate,
          customerNameSnapshot,
          customerNitSnapshot,
          dispatchAddressSnapshot,
          requesterName: dto.requesterName || null,
          requesterEmail: dto.requesterEmail || null,
          requesterRole: dto.requesterRole || null,
          requesterPhone: dto.requesterPhone || null,
          approvedQuoteConsecutive: dto.approvedQuoteConsecutive || null,
          deliveryInstructions: dto.deliveryInstructions || null,
          receiverName: dto.receiverName || dto.requesterName || null,
          receiverEmail: dto.receiverEmail || dto.requesterEmail || null,
          receiverPhone: dto.receiverPhone || dto.requesterPhone || null,
          receiverRole: dto.receiverRole || dto.requesterRole || null,
          invoiceFilingPlace: dto.invoiceFilingPlace || dispatchAddressSnapshot,
          approvalStatus: dto.approvalStatus || null,
          approvalReason: dto.approvalReason || null,
          approvalName: dto.approvalName || null,
          reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : null,
          preparedByName,
          zone: dto.zone || null,
          preparedByRole: dto.preparedByRole || null,
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
        include: {
          items: true,
          customer: true,
          opportunity: true,
          sourceQuote: true,
          sourceConversation: true,
        },
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
        sourceConversation: true,
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
        include: {
          customer: true,
          opportunity: true,
          sourceQuote: true,
          sourceConversation: true,
          items: true,
        },
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
          carrierName: dto.carrierName || null,
          trackingNumber: dto.trackingNumber || null,
          trackingUrl: dto.trackingUrl || null,
          deliveredToName: dto.deliveredToName || null,
          deliveryConfirmationNotes: dto.deliveryConfirmationNotes || null,
          logisticsNotes: dto.logisticsNotes,
          updatedBy: user.id,
        },
        include: {
          customer: true,
          opportunity: true,
          sourceQuote: true,
          sourceConversation: true,
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

  async exportClientFormat(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return this.orderXlsxExportService.generate(order);
  }

  private async assertOpportunityBelongsToCustomer(opportunityId: string, customerId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) {
      throw new NotFoundException("Opportunity not found");
    }
    if (opportunity.customerId !== customerId) {
      throw new BadRequestException("Opportunity does not belong to customer");
    }
  }

  private async assertQuoteBelongsToCustomer(quoteId: string, customerId: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    if (quote.customerId !== customerId) {
      throw new BadRequestException("Quote does not belong to customer");
    }
  }

  private async assertConversationBelongsToCustomer(conversationId: string, customerId: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }
    if (conversation.customerId && conversation.customerId !== customerId) {
      throw new BadRequestException("Conversation customer does not match order customer");
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

  private async nextOrderNumber() {
    const count = await this.prisma.order.count();
    return `PED-${String(count + 1).padStart(6, "0")}`;
  }
}
