import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
    await this.assertCustomerExists(dto.customerId);
    if (dto.opportunityId) {
      await this.assertOpportunityExists(dto.opportunityId);
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
      const quote = await tx.quote.create({
        data: {
          customerId: dto.customerId,
          opportunityId: dto.opportunityId ?? null,
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
}
