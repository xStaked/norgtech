import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "../orders/dto/create-order.dto";
import { OrdersService } from "../orders/orders.service";
import {
  OrderAutomationItemDto,
  ProcessOrderAutomationDto,
} from "./dto/process-order-automation.dto";

type AutomationDecision = "created" | "needs_clarification" | "human_review";

type ActiveCompany = {
  id: string;
  name: string;
  legalName?: string | null;
  prefix: string;
};

type ActiveCustomerZone = {
  id: string;
  zone: {
    name: string;
  } | null;
};

type ActiveProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  presentation?: string | null;
  basePrice: Prisma.Decimal | number | string;
};

@Injectable()
export class WhatsAppOrderAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async process(
    user: AuthUser,
    conversationId: string,
    dto: ProcessOrderAutomationDto,
  ) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
        contact: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException("WhatsApp conversation not found");
    }

    if (!conversation.customer) {
      return this.needsClarification(
        "customerId",
        "Necesito identificar el cliente antes de preparar el pedido.",
      );
    }

    const company = await this.resolveCompany(dto.companyRef);
    if (!company) {
      return this.needsClarification(
        "companyId",
        "Para preparar el pedido, dime por cual empresa debe salir.",
      );
    }

    const customerZone = await this.resolveCustomerZone(
      conversation.customer.id,
      dto.customerZoneId,
      dto.zoneRef,
    );
    if (customerZone === undefined) {
      return this.needsClarification(
        "customerZoneId",
        "Para preparar el pedido, dime la zona o sede de despacho.",
      );
    }

    const products = await this.prisma.product.findMany({
      where: { active: true },
    });
    const resolvedItems = [];

    for (const item of dto.items) {
      const resolvedProduct = this.resolveProduct(products, item.productRef);

      if (resolvedProduct.decision === "needs_clarification") {
        return this.needsClarification(
          "items",
          `No encontre el producto "${item.productRef}". Puedes enviarme SKU o referencia exacta?`,
        );
      }

      if (resolvedProduct.decision === "human_review") {
        return {
          decision: "human_review" satisfies AutomationDecision,
          reason: `Producto ambiguo: ${item.productRef}`,
          options: resolvedProduct.options,
          proposal: {
            ...dto,
            customerId: conversation.customer.id,
            companyId: company.id,
            customerZoneId: customerZone?.id ?? null,
          },
        };
      }

      resolvedItems.push({
        candidate: item,
        product: resolvedProduct.product,
      });
    }

    const payload: CreateOrderDto = {
      customerId: conversation.customer.id,
      companyId: company.id,
      customerZoneId: customerZone?.id,
      sourceConversationId: conversationId,
      requesterName: conversation.contact?.fullName ?? conversation.senderName ?? undefined,
      requesterPhone: conversation.phone,
      deliveryInstructions: dto.deliveryInstructions,
      notes: dto.notes,
      approvalStatus: "en_revision",
      items: resolvedItems.map(({ candidate, product }) => ({
        productId: product.id,
        quantity: candidate.quantity,
        unitPrice: this.decimalToNumber(product.basePrice),
        presentation: candidate.presentation,
        notes: candidate.notes,
      })),
    };

    try {
      const order = await this.ordersService.create(user, payload);
      const summary = {
        company: {
          id: company.id,
          name: company.name,
          prefix: company.prefix,
        },
        zone: customerZone
          ? {
              id: customerZone.id,
              name: customerZone.zone?.name ?? null,
            }
          : null,
        items: resolvedItems.map(({ candidate, product }) => ({
          name: product.name,
          sku: product.sku,
          quantity: candidate.quantity,
          unit: product.unit,
        })),
        total: this.orderTotalToNumber(order),
      };

      return {
        decision: "created" satisfies AutomationDecision,
        order,
        summary,
        reply: this.createdReply(summary.items),
      };
    } catch (error) {
      return {
        decision: "human_review" satisfies AutomationDecision,
        reason: error instanceof Error ? error.message : "No fue posible crear el pedido.",
        proposal: payload,
      };
    }
  }

  private async resolveCompany(companyRef?: string) {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, legalName: true, prefix: true },
    });

    if (!companyRef?.trim()) {
      return companies.length === 1 ? (companies[0] as ActiveCompany) : null;
    }

    const normalizedRef = this.normalize(companyRef);
    return (
      (companies as ActiveCompany[]).find((company) =>
        [company.id, company.name, company.legalName, company.prefix].some(
          (candidate) => this.normalize(candidate) === normalizedRef,
        ),
      ) ?? null
    );
  }

  private async resolveCustomerZone(
    customerId: string,
    customerZoneId?: string,
    zoneRef?: string,
  ): Promise<ActiveCustomerZone | null | undefined> {
    const customerZones = (await this.prisma.customerZone.findMany({
      where: { customerId, isActive: true },
      include: { zone: true },
    })) as ActiveCustomerZone[];

    if (customerZones.length === 0) {
      return null;
    }

    if (customerZoneId?.trim()) {
      return customerZones.find((customerZone) => customerZone.id === customerZoneId) ?? undefined;
    }

    if (!zoneRef?.trim()) {
      return customerZones.length === 1 ? customerZones[0] : undefined;
    }

    const normalizedRef = this.normalize(zoneRef);
    return (
      customerZones.find(
        (customerZone) => this.normalize(customerZone.zone?.name) === normalizedRef,
      ) ?? undefined
    );
  }

  private resolveProduct(products: ActiveProduct[], productRef: string) {
    const normalizedRef = this.normalize(productRef);
    const exactSku = products.filter(
      (product) => this.normalize(product.sku) === normalizedRef,
    );
    if (exactSku.length === 1) {
      return { decision: "created" as const, product: exactSku[0] };
    }

    const exactName = products.filter(
      (product) => this.normalize(product.name) === normalizedRef,
    );
    if (exactName.length === 1) {
      return { decision: "created" as const, product: exactName[0] };
    }

    const skuContained = products.filter((product) => {
      const sku = this.normalize(product.sku);
      return sku.length >= 3 && normalizedRef.includes(sku);
    });
    if (skuContained.length === 1) {
      return { decision: "created" as const, product: skuContained[0] };
    }

    const partialMatches = products.filter((product) => {
      const name = this.normalize(product.name);
      return (
        (normalizedRef.length >= 4 && name.includes(normalizedRef)) ||
        (name.length >= 4 && normalizedRef.includes(name))
      );
    });

    if (partialMatches.length === 1) {
      return { decision: "created" as const, product: partialMatches[0] };
    }

    const candidates = skuContained.length > 0 ? skuContained : partialMatches;
    if (candidates.length > 1) {
      return {
        decision: "human_review" as const,
        options: candidates.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
        })),
      };
    }

    return { decision: "needs_clarification" as const };
  }

  private needsClarification(missingField: string, question: string) {
    return {
      decision: "needs_clarification" satisfies AutomationDecision,
      missingField,
      question,
    };
  }

  private createdReply(items: Array<{ name: string }>) {
    const productNames = items.map((item) => item.name).join(", ");
    return `Recibimos tu pedido y queda en revision. Productos: ${productNames}.`;
  }

  private decimalToNumber(value: Prisma.Decimal | number | string) {
    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }
    return Number(value);
  }

  private orderTotalToNumber(order: { total?: Prisma.Decimal | number | string | null }) {
    if (order.total === undefined || order.total === null) {
      return 0;
    }
    return this.decimalToNumber(order.total);
  }

  private normalize(value?: string | null) {
    return (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
}
