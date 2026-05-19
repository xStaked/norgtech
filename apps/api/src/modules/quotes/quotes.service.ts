import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { UpdateQuoteStatusDto } from "./dto/update-quote-status.dto";

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateQuoteDto) {
    const opportunityId = dto.opportunityId?.trim() || null;

    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      include: { segment: true },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    if (opportunityId) {
      await this.assertOpportunityExists(opportunityId);
    }

    const discountPercent = customer.segment?.discountPercent ?? new Prisma.Decimal(0);

    const itemsWithSnapshot = await Promise.all(
      dto.items.map(async (item) => {
        if (item.productId) {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
          });
          if (!product) {
            throw new NotFoundException(`Product ${item.productId} not found`);
          }
          const basePrice = product.basePrice;
          const discountMultiplier = new Prisma.Decimal(1).minus(
            new Prisma.Decimal(discountPercent).dividedBy(100),
          );
          const unitPrice = new Prisma.Decimal(basePrice).times(discountMultiplier);
          const unitPriceRounded = unitPrice.toDecimalPlaces(2);
          const subtotal = new Prisma.Decimal(item.quantity).times(unitPriceRounded);

          return {
            productId: item.productId,
            productSnapshotName: product.name,
            productSnapshotSku: product.sku,
            unit: product.unit,
            quantity: item.quantity,
            originalUnitPrice: basePrice,
            discountPercent,
            unitPrice: unitPriceRounded,
            subtotal,
            notes: item.notes,
          };
        }
        return {
          productId: null,
          productSnapshotName: "Custom item",
          productSnapshotSku: "CUSTOM",
          unit: "unit",
          quantity: item.quantity,
          originalUnitPrice: null,
          discountPercent: null,
          unitPrice: item.unitPrice,
          subtotal: new Prisma.Decimal(item.quantity).times(new Prisma.Decimal(item.unitPrice)),
          notes: item.notes,
        };
      }),
    );

    const subtotal = itemsWithSnapshot.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.subtotal)),
      new Prisma.Decimal(0),
    );
    const total = subtotal;

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          customerId: dto.customerId,
          opportunityId,
          notes: dto.notes,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          subtotal,
          total,
          createdBy: user.id,
          updatedBy: user.id,
          items: {
            create: itemsWithSnapshot,
          },
        },
        include: { items: true, customer: true, opportunity: true },
      });

      await this.auditService.record(
        {
          entityType: "Quote",
          entityId: quote.id,
          action: "quote.created",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(quote)),
        },
        tx,
      );

      return quote;
    });
  }

  findAll() {
    return this.prisma.quote.findMany({
      include: { customer: true, opportunity: true, items: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(id: string) {
    return this.prisma.quote.findUnique({
      where: { id },
      include: { customer: true, opportunity: true, items: true },
    });
  }

  async updateStatus(user: AuthUser, quoteId: string, dto: UpdateQuoteStatusDto) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }

    const previousState = JSON.parse(JSON.stringify(quote));

    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: { status: dto.status, updatedBy: user.id },
      include: { customer: true, opportunity: true, items: true },
    });

    await this.auditService.record({
      entityType: "Quote",
      entityId: updated.id,
      action: "quote.status_changed",
      actorUserId: user.id,
      previousState,
      nextState: JSON.parse(JSON.stringify(updated)),
    });

    return updated;
  }

  async createBillingRequest(user: AuthUser, quoteId: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { items: true },
    });

    if (!quote) {
      throw new NotFoundException("Quote not found");
    }

    if (quote.status !== "cerrada") {
      throw new BadRequestException("Billing request can only be created from closed quotes");
    }

    return this.prisma.$transaction(async (tx) => {
      const billingRequest = await tx.billingRequest.create({
        data: {
          customerId: quote.customerId,
          opportunityId: quote.opportunityId,
          sourceType: "quote",
          sourceQuoteId: quote.id,
          status: "pendiente",
          requestedByUserId: user.id,
          createdBy: user.id,
          updatedBy: user.id,
        },
        include: { customer: true },
      });

      await this.auditService.record(
        {
          entityType: "BillingRequest",
          entityId: billingRequest.id,
          action: "billing_request.created_from_quote",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(billingRequest)),
        },
        tx,
      );

      return billingRequest;
    });
  }

  private async assertOpportunityExists(opportunityId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) {
      throw new NotFoundException("Opportunity not found");
    }
  }
}
