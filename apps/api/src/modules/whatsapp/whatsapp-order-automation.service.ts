import { Inject, Injectable, Logger, NotFoundException, forwardRef } from "@nestjs/common";
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
  private readonly logger = new Logger(WhatsAppOrderAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OrdersService))
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

    const customer =
      conversation.customer ?? (await this.resolveCustomer(dto.customerRef));
    if (customer === undefined) {
      return {
        decision: "human_review" satisfies AutomationDecision,
        reason: `Cliente ambiguo: ${dto.customerRef}`,
        proposal: dto,
      };
    }
    if (!customer) {
      return this.needsClarification(
        "customerId",
        "Necesito identificar el cliente antes de preparar el pedido. Dime el nombre o NIT del cliente.",
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
      customer.id,
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
    const resolvedItems: Array<{
      candidate: OrderAutomationItemDto;
      product: ActiveProduct | null;
    }> = [];

    for (const item of dto.items) {
      const resolvedProduct = this.resolveProduct(products, item.productRef);
      if (resolvedProduct.decision === "created") {
        resolvedItems.push({ candidate: item, product: resolvedProduct.product });
      } else {
        resolvedItems.push({ candidate: item, product: null });
      }
    }

    const payload: CreateOrderDto = {
      customerId: customer.id,
      companyId: company.id,
      customerZoneId: customerZone?.id,
      sourceConversationId: conversationId,
      requesterName: conversation.contact?.fullName ?? conversation.senderName ?? undefined,
      requesterPhone: conversation.phone,
      deliveryInstructions: dto.deliveryInstructions,
      notes: dto.notes,
      approvalStatus: "en_revision",
      items: resolvedItems.map(({ candidate, product }) =>
        product
          ? {
              productId: product.id,
              quantity: candidate.quantity,
              unitPrice: this.decimalToNumber(product.basePrice),
              presentation: candidate.presentation,
              notes: candidate.notes,
            }
          : {
              productName: candidate.productRef,
              quantity: candidate.quantity,
              unitPrice: 0,
              presentation: candidate.presentation,
              notes: candidate.notes,
              needsResolution: true,
            },
      ),
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
          name: product?.name ?? candidate.productRef,
          sku: product?.sku ?? "POR RESOLVER",
          quantity: candidate.quantity,
          unit: product?.unit ?? "und",
          needsResolution: !product,
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

  private async resolveCustomer(customerRef?: string) {
    if (!customerRef?.trim()) {
      return null;
    }
    const customers = await this.prisma.customer.findMany({
      where: { active: true },
      select: { id: true, displayName: true, legalName: true, taxId: true },
    });
    const normalizedRef = this.normalize(customerRef);
    const matches = customers.filter((candidate) =>
      [candidate.displayName, candidate.legalName, candidate.taxId].some(
        (value) => value && this.normalize(value) === normalizedRef,
      ),
    );
    if (matches.length === 1) {
      return { id: matches[0].id };
    }
    if (matches.length > 1) {
      return undefined; // ambiguous
    }
    return null; // not found
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

  /**
   * Valor estimado del pedido que armo un cliente por WhatsApp, con su lista de
   * precios y descuentos (la misma cuenta que hara la orden). Devuelve null si
   * algun producto no se resuelve o el precio queda ambiguo: preferimos no
   * decir un total a medias.
   */
  async estimateForCustomer(
    customerId: string,
    items: Array<{ productRef: string; quantity: number; presentation?: string }>,
  ) {
    try {
      const products = (await this.prisma.product.findMany({
        where: { active: true },
      })) as ActiveProduct[];

      const pricedItems = [];
      for (const item of items) {
        const resolved = this.resolveProduct(products, item.productRef);
        if (resolved.decision !== "created" || !resolved.product) {
          return null;
        }
        pricedItems.push({
          productId: resolved.product.id,
          quantity: item.quantity,
          presentation: item.presentation,
          // Con productId el precio sale de la lista del cliente; este valor se ignora.
          unitPrice: 0,
        });
      }

      return await this.ordersService.preview({ customerId, items: pricedItems });
    } catch (error) {
      // Presentacion ambigua, producto sin precio, cualquier cosa: el pedido ya
      // esta armado y la confirmacion tiene que salir igual, solo sin el total.
      this.logger.warn(`No se pudo estimar el valor del pedido: ${String(error)}`);
      return null;
    }
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
      const skuTokens = this.tokens(product.sku);
      return skuTokens.length > 0 && this.containsTokenSequence(this.tokens(productRef), skuTokens);
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

  private tokens(value?: string | null) {
    return this.normalize(value).split(/\s+/).filter(Boolean);
  }

  private containsTokenSequence(haystack: string[], needle: string[]) {
    if (needle.length === 0 || needle.length > haystack.length) {
      return false;
    }

    return haystack.some((_, index) =>
      needle.every((token, needleIndex) => haystack[index + needleIndex] === token),
    );
  }
}
