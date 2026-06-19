import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InvoiceStatus, OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { UpdateOrderLogisticsDto } from "./dto/update-order-logistics.dto";
import { OrderXlsxExportService } from "./order-xlsx-export.service";
import { CreditService } from "../credit/credit.service";
import { allowedTransitions } from "./order-status-transition-map";

const INVOICE_ALLOWED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.orden_facturacion,
  OrderStatus.facturado,
  OrderStatus.despachado,
  OrderStatus.entregado,
];

const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  recibido: 0,
  orden_facturacion: 1,
  facturado: 2,
  despachado: 3,
  en_transito: 4,
  entregado: 5,
};

const includeInvoiceRelations = {
  company: true,
  customer: { select: { id: true, displayName: true, taxId: true, creditLimit: true, paymentDays: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
  payments: {
    include: {
      supports: true,
    },
    orderBy: { paymentDate: "desc" as const },
  },
} satisfies Prisma.InvoiceInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orderXlsxExportService: OrderXlsxExportService,
    private readonly credit: CreditService,
  ) {}

  async create(user: AuthUser, dto: CreateOrderDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      include: { segment: true },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }
    if (dto.customerZoneId) {
      const customerZone = await this.prisma.customerZone.findUnique({
        where: { id: dto.customerZoneId },
      });
      if (!customerZone || !customerZone.isActive) {
        throw new NotFoundException("Customer zone assignment not found or inactive");
      }
      if (customerZone.customerId !== dto.customerId) {
        throw new BadRequestException("Zone does not belong to selected customer");
      }
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

    const orderSubtotal = dto.items.reduce(
      (sum, item) =>
        sum.plus(
          new Prisma.Decimal(item.quantity).times(new Prisma.Decimal(item.unitPrice)),
        ),
      new Prisma.Decimal(0),
    );

    await this.credit.assertCreditLimit(dto.customerId, orderSubtotal);

    const discountPercent = customer.segment?.discountPercent ?? new Prisma.Decimal(0);
    const orderNumber = dto.orderNumber?.trim() || await this.nextOrderNumber(company.prefix);
    const orderDate = dto.orderDate ? new Date(dto.orderDate) : new Date();
    const customerNameSnapshot = customer.displayName;
    const customerNitSnapshot = customer.taxId ?? null;
    const billingCompanyNameSnapshot =
      dto.billingCompanyNameSnapshot?.trim() || customerNameSnapshot || null;
    const branchNameSnapshot = dto.branchNameSnapshot?.trim() || null;
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
          companyId: dto.companyId,
          opportunityId: dto.opportunityId || null,
          sourceQuoteId: dto.sourceQuoteId || null,
          sourceConversationId: dto.sourceConversationId || null,
          orderNumber,
          purchaseOrderNumber: dto.purchaseOrderNumber || null,
          orderDate,
          customerNameSnapshot,
          customerNitSnapshot,
          billingCompanyNameSnapshot,
          branchNameSnapshot,
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
          customerZoneId: dto.customerZoneId || null,
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

  async createInvoiceFromOrder(user: AuthUser, orderId: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              customer: true,
              company: true,
              items: true,
              invoices: true,
            },
          });

          if (!order) {
            throw new NotFoundException("Order not found");
          }
          if (!INVOICE_ALLOWED_ORDER_STATUSES.includes(order.status)) {
            throw new BadRequestException("Order status is not invoiceable");
          }
          if (!order.companyId || !order.company || !order.company.isActive) {
            throw new BadRequestException("Order billing company is missing or inactive");
          }
          if (!order.customerId || !order.customer) {
            throw new BadRequestException("Order customer is missing");
          }
          if (!order.items.length) {
            throw new BadRequestException("Order has no items to invoice");
          }

          const activeInvoice = await tx.invoice.findFirst({
            where: {
              orderId: order.id,
              status: { not: InvoiceStatus.anulada },
            },
          });
          if (activeInvoice) {
            throw new BadRequestException("Order already has an active invoice");
          }

          const totals = this.calculateInvoiceTotalsFromOrder(order);
          await this.credit.assertCreditLimit(order.customerId, totals.totalAmount, tx);

          const issueDate = new Date();
          const dueDate = this.calculateInvoiceDueDate(issueDate, order.customer.paymentDays);
          const invoiceNumber = await this.nextInvoiceNumber(order.company.prefix, tx);
          const previousOrderState = JSON.parse(JSON.stringify(order));

          const invoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              companyId: order.companyId,
              customerId: order.customerId,
              orderId: order.id,
              issueDate,
              dueDate,
              subtotal: totals.subtotal,
              taxAmount: totals.taxAmount,
              totalAmount: totals.totalAmount,
              totalPaid: 0,
              status: InvoiceStatus.emitida,
              notes: `Generada desde pedido ${order.orderNumber ?? order.id}`,
              createdBy: user.id,
              updatedBy: user.id,
            },
            include: includeInvoiceRelations,
          });

          if (ORDER_STATUS_RANK[order.status] < ORDER_STATUS_RANK.facturado) {
            const updatedOrder = await tx.order.update({
              where: { id: order.id },
              data: {
                status: OrderStatus.facturado,
                updatedBy: user.id,
              },
            });

            await this.auditService.record(
              {
                entityType: "Order",
                entityId: order.id,
                action: "order.status_changed",
                actorUserId: user.id,
                previousState: previousOrderState,
                nextState: JSON.parse(JSON.stringify(updatedOrder)),
              },
              tx,
            );
          }

          await this.auditService.record(
            {
              entityType: "Invoice",
              entityId: invoice.id,
              action: "invoice.created_from_order",
              actorUserId: user.id,
              nextState: JSON.parse(JSON.stringify({
                invoice,
                orderTotal: order.total,
                computedItemTotal: totals.itemTotal,
              })),
            },
            tx,
          );

          return invoice;
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
        if (this.isOrderActiveInvoiceConstraintError(error)) {
          throw new BadRequestException("Order already has an active invoice");
        }
        if (attempt === 0) {
          continue;
        }
        throw new BadRequestException("Unable to generate invoice number");
      }
    }

    throw new BadRequestException("Unable to generate invoice number");
  }

  findAll(status?: OrderStatus, companyId?: string) {
    const where: Prisma.OrderWhereInput = {};
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    return this.prisma.order.findMany({
      where,
      include: { customer: true, opportunity: true, items: true, company: true, customerZone: { include: { zone: true } } },
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
        customerZone: { include: { zone: true, assignedTo: { select: { id: true, name: true } } } },
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
        company: true,
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
          companyId: order.companyId,
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

  private async nextOrderNumber(companyPrefix: string) {
    const last = await this.prisma.order.findFirst({
      where: { orderNumber: { startsWith: `${companyPrefix}-` } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });

    if (!last?.orderNumber) {
      return `${companyPrefix}-001`;
    }

    const parts = last.orderNumber.split("-");
    const seq = Number.parseInt(parts[parts.length - 1] ?? "0", 10) || 0;
    return `${companyPrefix}-${String(seq + 1).padStart(3, "0")}`;
  }

  private calculateInvoiceTotalsFromOrder(order: {
    total: Prisma.Decimal | number | string;
    items: Array<{
      quantity: Prisma.Decimal | number | string;
      subtotal: Prisma.Decimal | number | string;
      taxAmount: Prisma.Decimal | number | string;
      totalWithTax: Prisma.Decimal | number | string;
    }>;
  }) {
    const subtotal = order.items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.subtotal)),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const taxAmount = order.items.reduce(
      (sum, item) =>
        sum.plus(new Prisma.Decimal(item.taxAmount).times(new Prisma.Decimal(item.quantity))),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const itemTotal = order.items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.totalWithTax)),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const orderTotal = new Prisma.Decimal(order.total).toDecimalPlaces(2);
    const totalAmount = itemTotal.isZero() || itemTotal.minus(orderTotal).abs().lte(1)
      ? orderTotal
      : itemTotal;

    return { subtotal, taxAmount, totalAmount, itemTotal };
  }

  private calculateInvoiceDueDate(issueDate: Date, paymentDays: number | null): Date {
    const due = new Date(issueDate);
    due.setDate(due.getDate() + (paymentDays ?? 0));
    return due;
  }

  private async nextInvoiceNumber(
    companyPrefix: string,
    client: Pick<Prisma.TransactionClient, "invoice">,
  ): Promise<string> {
    const invoices = await client.invoice.findMany({
      where: { invoiceNumber: { startsWith: `${companyPrefix}-` } },
      select: { invoiceNumber: true },
    });

    const nextSequence = invoices.reduce((max, invoice) => {
      const match = invoice.invoiceNumber.match(/-(\d+)$/);
      const seq = match ? Number.parseInt(match[1], 10) : 0;
      return Number.isFinite(seq) && seq > max ? seq : max;
    }, 0);

    if (nextSequence === 0) {
      return `${companyPrefix}-001`;
    }

    return `${companyPrefix}-${String(nextSequence + 1).padStart(3, "0")}`;
  }

  private isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }

  private isOrderActiveInvoiceConstraintError(error: unknown): boolean {
    if (!this.isUniqueConstraintError(error)) {
      return false;
    }

    const target = error.meta?.target;
    return Array.isArray(target) && target.includes("orderId");
  }
}
