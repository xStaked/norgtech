import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { PricingService } from "../pricing/pricing.service";
import { PricingCustomer } from "../pricing/pricing.types";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { PreviewQuoteDto } from "./dto/preview-quote.dto";
import { UpdateQuoteStatusDto } from "./dto/update-quote-status.dto";
import { auditState } from "../audit/audit-state";

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly pricingService: PricingService,
  ) {}

  async preview(dto: PreviewQuoteDto, user?: AuthUser) {
    const customer = await this.loadCustomerOrThrow(dto.customerId);
    return this.pricingService.buildPreview(customer, dto.items, "quote", user?.id ?? null);
  }

  async create(user: AuthUser, dto: CreateQuoteDto) {
    const opportunityId = dto.opportunityId?.trim() || null;

    const customer = await this.loadCustomerOrThrow(dto.customerId);
    // Un comercial solo cotiza a su cartera.
    if (user.role === "comercial") {
      const owner = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        select: { assignedToUserId: true },
      });
      if (owner?.assignedToUserId !== user.id) {
        throw new ForbiddenException("No tienes acceso a este cliente");
      }
    }
    if (opportunityId) {
      await this.assertOpportunityExists(opportunityId);
    }

    const pricing = await this.pricingService.priceLines(customer, dto.items, "quote", user.id);

    const itemsWithSnapshot = pricing.rawItems.map((line, index) => ({
      productId: line.productId,
      productSnapshotName: line.productSnapshotName,
      productSnapshotSku: line.productSnapshotSku,
      unit: line.unit,
      presentationSnapshot: line.productPresentation ?? null,
      quantity: line.quantity,
      originalUnitPrice: line.originalUnitPrice,
      discountPercent: line.discountPercent,
      bonusPercent: line.bonusPercent ? line.bonusPercent.toNumber() : null,
      bonusQty: line.bonusQty,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      notes: dto.items[index].notes,
      priceSource: line.priceSource ?? (line.priceListName ? "price_list" : "base_price"),
      priceListIdSnapshot: line.priceListId ?? null,
      priceListNameSnapshot: line.priceListName ?? null,
      currencySnapshot: line.currency ?? customer.currency ?? "COP",
      taxPercentSnapshot: line.taxPercent,
    }));

    const subtotal = pricing.subtotal;
    const total = pricing.total;

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          customerId: dto.customerId,
          opportunityId,
          notes: dto.notes,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          subtotal,
          total,
          currencySnapshot: customer.currency ?? "COP",
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
          nextState: auditState(quote),
        },
        tx,
      );

      return quote;
    });
  }

  findAll(user: AuthUser) {
    // Quote no tiene vendedor propio: la cartera la define el cliente. Espejo
    // de InvoicesService.buildWhere.
    const where: Prisma.QuoteWhereInput = {};
    if (user.role === "comercial") {
      where.customer = { assignedToUserId: user.id };
    }
    return this.prisma.quote.findMany({
      where,
      include: { customer: true, opportunity: true, items: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { customer: true, opportunity: true, items: true },
    });
    if (
      quote &&
      user.role === "comercial" &&
      quote.customer?.assignedToUserId !== user.id
    ) {
      throw new ForbiddenException("No tienes acceso a esta cotización");
    }
    return quote;
  }

  private assertCanAccess(
    user: AuthUser,
    quote: { customer?: { assignedToUserId?: string | null } | null },
  ) {
    if (user.role === "comercial" && quote.customer?.assignedToUserId !== user.id) {
      throw new ForbiddenException("No tienes acceso a esta cotización");
    }
  }

  async updateStatus(user: AuthUser, quoteId: string, dto: UpdateQuoteStatusDto) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { customer: { select: { assignedToUserId: true } } },
    });
    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    this.assertCanAccess(user, quote);

    const previousState = auditState(quote);

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
      nextState: auditState(updated),
    });

    return updated;
  }

  async createBillingRequest(user: AuthUser, quoteId: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: true,
        customer: true,
      },
    });

    if (!quote) {
      throw new NotFoundException("Quote not found");
    }
    this.assertCanAccess(user, quote);

    if (quote.status !== "cerrada") {
      throw new BadRequestException("Billing request can only be created from closed quotes");
    }

    // La billing request debe facturarse desde la empresa del cliente de la
    // cotizacion, no desde la empresa activa mas antigua (siempre Norgtech):
    // para un cliente de Nanonutricion eso generaba una billing request que
    // InvoicesService.create despues rechazaba por no coincidir empresas.
    const company = await this.prisma.company.findUnique({
      where: { id: quote.customer.companyId },
    });
    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }

    return this.prisma.$transaction(async (tx) => {
      const billingRequest = await tx.billingRequest.create({
        data: {
          customerId: quote.customerId,
          opportunityId: quote.opportunityId,
          sourceType: "quote",
          sourceQuoteId: quote.id,
          companyId: company.id,
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
          nextState: auditState(billingRequest),
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

  private async loadCustomerOrThrow(customerId: string): Promise<PricingCustomer> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { segment: true },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }
}
