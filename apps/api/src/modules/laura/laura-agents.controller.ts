import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { OpportunityStage, VisitStatus, FollowUpTaskType, FollowUpTaskStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ServiceTokenGuard } from "../auth/service-token.guard";
import {
  SearchProductsDto,
  SearchQuotesDto,
  SearchOrdersDto,
  SearchContactsDto,
  SearchVisitsDto,
  SearchFollowupsDto,
} from "./dto/laura-agents-query.dto";

const SYSTEM_USER_ID = "system";

@Controller("laura/agents")
@UseGuards(ServiceTokenGuard)
export class LauraAgentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("customers")
  async searchCustomers(@Query("search") search: string) {
    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { displayName: { contains: search, mode: "insensitive" } },
          { legalName: { contains: search, mode: "insensitive" } },
          { contacts: { some: { fullName: { contains: search, mode: "insensitive" } } } },
        ],
      },
      include: { contacts: true },
      take: 10,
    });

    return customers.map((c) => ({
      id: c.id,
      label: c.displayName,
      contacts: c.contacts.map((ct) => ({
        id: ct.id,
        fullName: ct.fullName,
        roleTitle: ct.roleTitle,
        email: ct.email,
        phone: ct.phone,
        isPrimary: ct.isPrimary,
      })),
    }));
  }

  @Get("customers/:id")
  async getCustomerDetails(@Param("id") id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: { contacts: true },
    });
  }

  @Get("opportunities")
  async searchOpportunities(@Query("search") search: string) {
    const opportunities = await this.prisma.opportunity.findMany({
      where: {
        title: { contains: search, mode: "insensitive" },
      },
      take: 10,
    });

    return opportunities.map((o) => ({
      id: o.id,
      label: o.title,
    }));
  }

  @Get("opportunities/:id")
  async getOpportunityDetails(@Param("id") id: string) {
    return this.prisma.opportunity.findUnique({
      where: { id },
      include: { customer: true },
    });
  }

@Get("users/:userId/tasks")
  async getPendingTasks(@Param("userId") userId: string) {
    const tasks = await this.prisma.followUpTask.findMany({
      where: {
        status: FollowUpTaskStatus.pendiente,
        OR: [{ assignedToUserId: userId }, { assignedToUserId: null }],
      },
      include: {
        customer: { include: { contacts: true } },
        opportunity: true,
      },
      orderBy: { dueAt: "asc" },
    });

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt.toISOString(),
      type: t.type,
      customer: t.customer
        ? {
            id: t.customer.id,
            displayName: t.customer.displayName,
            contacts: t.customer.contacts.map((ct) => ({
              id: ct.id,
              fullName: ct.fullName,
              roleTitle: ct.roleTitle,
              isPrimary: ct.isPrimary,
            })),
          }
        : null,
      opportunity: t.opportunity
        ? { id: t.opportunity.id, title: t.opportunity.title }
        : null,
    }));
  }

  @Get("users/:userId/visits")
  async getScheduledVisits(@Param("userId") userId: string) {
    const visits = await this.prisma.visit.findMany({
      where: {
        status: VisitStatus.programada,
        OR: [{ assignedToUserId: userId }, { assignedToUserId: null }],
      },
      include: {
        customer: { include: { contacts: true } },
        opportunity: true,
      },
      orderBy: { scheduledAt: "asc" },
    });

    return visits.map((v) => ({
      id: v.id,
      summary: v.summary ?? "",
      scheduledAt: v.scheduledAt.toISOString(),
      customer: v.customer
        ? {
            id: v.customer.id,
            displayName: v.customer.displayName,
            contacts: v.customer.contacts.map((ct) => ({
              id: ct.id,
              fullName: ct.fullName,
              roleTitle: ct.roleTitle,
              isPrimary: ct.isPrimary,
            })),
          }
        : null,
      opportunity: v.opportunity
        ? { id: v.opportunity.id, title: v.opportunity.title }
        : null,
    }));
  }

  @Post("interactions")
  async createInteraction(
    @Body() body: {
      customerId: string;
      summary: string;
      rawMessage: string;
      opportunityId?: string;
      occurredAt?: string;
      nextStep?: string;
      signals?: Record<string, unknown>;
    },
  ) {
    const now = new Date();
    const visit = await this.prisma.visit.create({
      data: {
        status: VisitStatus.completada,
        customerId: body.customerId,
        summary: body.summary,
        nextStep: body.nextStep,
        scheduledAt: body.occurredAt ? new Date(body.occurredAt) : now,
        completedAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });

    return { id: visit.id };
  }

  @Post("opportunities")
  async upsertOpportunity(
    @Body() body: {
      customerId: string;
      title: string;
      stage: string;
      opportunityId?: string;
    },
  ) {
    const stage = body.stage as OpportunityStage;

    if (body.opportunityId) {
      const updated = await this.prisma.opportunity.update({
        where: { id: body.opportunityId },
        data: { stage, updatedBy: SYSTEM_USER_ID },
      });
      return { id: updated.id };
    }

    const created = await this.prisma.opportunity.create({
      data: {
        customerId: body.customerId,
        title: body.title,
        stage,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
    return { id: created.id };
  }

  @Post("followups")
  async createFollowUp(
    @Body() body: {
      customerId: string;
      title: string;
      dueAt: string;
      type: string;
      opportunityId?: string;
    },
  ) {
    const task = await this.prisma.followUpTask.create({
      data: {
        title: body.title,
        dueAt: new Date(body.dueAt),
        type: body.type as FollowUpTaskType,
        status: FollowUpTaskStatus.pendiente,
        customerId: body.customerId,
        opportunityId: body.opportunityId,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
    return { id: task.id };
  }

  @Post("visits")
  async createVisit(
    @Body() body: {
      customerId: string;
      scheduledAt: string;
      summary?: string;
      notes?: string;
      nextStep?: string;
      opportunityId?: string;
      assignedToUserId?: string;
    },
  ) {
    const visit = await this.prisma.visit.create({
      data: {
        customerId: body.customerId,
        opportunityId: body.opportunityId,
        scheduledAt: new Date(body.scheduledAt),
        summary: body.summary,
        notes: body.notes,
        nextStep: body.nextStep,
        assignedToUserId: body.assignedToUserId,
        status: VisitStatus.programada,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
    return { id: visit.id };
  }

  @Post("tasks")
  async createTask(
    @Body() body: {
      customerId: string;
      title: string;
      dueAt?: string;
      type?: string;
      opportunityId?: string;
      notes?: string;
    },
  ) {
    const task = await this.prisma.followUpTask.create({
      data: {
        title: body.title,
        dueAt: body.dueAt ? new Date(body.dueAt) : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        type: (body.type as FollowUpTaskType) ?? FollowUpTaskType.llamada,
        status: FollowUpTaskStatus.pendiente,
        customerId: body.customerId,
        opportunityId: body.opportunityId,
        notes: body.notes,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
    return { id: task.id };
  }

  @Get("products")
  async searchProducts(@Query() dto: SearchProductsDto) {
    const where: any = {};
    if (dto.search) {
      where.OR = [
        { name: { contains: dto.search, mode: "insensitive" } },
        { sku: { contains: dto.search, mode: "insensitive" } },
      ];
    }
    if (dto.active !== undefined) where.active = dto.active;
    const products = await this.prisma.product.findMany({ where, take: 20 });
    return products;
  }

  @Get("products/:id")
  async getProductDetails(@Param("id") id: string) {
    return this.prisma.product.findUniqueOrThrow({ where: { id } });
  }

  @Get("quotes")
  async searchQuotes(@Query() dto: SearchQuotesDto) {
    const where: any = {};
    if (dto.customerId) where.customerId = dto.customerId;
    if (dto.status) where.status = dto.status;
    if (dto.search) {
      where.OR = [
        { customer: { displayName: { contains: dto.search, mode: "insensitive" } } },
        { customer: { legalName: { contains: dto.search, mode: "insensitive" } } },
      ];
    }
    return this.prisma.quote.findMany({
      where,
      include: { items: true, customer: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  @Get("quotes/:id")
  async getQuoteDetails(@Param("id") id: string) {
    return this.prisma.quote.findUniqueOrThrow({
      where: { id },
      include: { items: true, customer: { select: { id: true, displayName: true } } },
    });
  }

  @Get("orders")
  async searchOrders(@Query() dto: SearchOrdersDto) {
    const where: any = {};
    if (dto.customerId) where.customerId = dto.customerId;
    if (dto.status) where.status = dto.status;
    if (dto.search) {
      where.OR = [
        { customer: { displayName: { contains: dto.search, mode: "insensitive" } } },
        { customer: { legalName: { contains: dto.search, mode: "insensitive" } } },
      ];
    }
    return this.prisma.order.findMany({
      where,
      include: { items: true, customer: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  @Get("orders/:id")
  async getOrderDetails(@Param("id") id: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: { items: true, customer: { select: { id: true, displayName: true } } },
    });
  }

  @Get("segments")
  async searchSegments() {
    return this.prisma.customerSegment.findMany({ where: { active: true } });
  }

  @Get("segments/:id")
  async getSegmentDetails(@Param("id") id: string) {
    return this.prisma.customerSegment.findUniqueOrThrow({ where: { id } });
  }

  @Get("contacts")
  async searchContacts(@Query() dto: SearchContactsDto) {
    const where: any = {};
    if (dto.customerId) where.customerId = dto.customerId;
    if (dto.search) {
      where.OR = [
        { fullName: { contains: dto.search, mode: "insensitive" } },
        { email: { contains: dto.search, mode: "insensitive" } },
      ];
    }
    return this.prisma.contact.findMany({
      where,
      include: { customer: { select: { id: true, displayName: true } } },
      take: 20,
    });
  }

  @Get("contacts/:id")
  async getContactDetails(@Param("id") id: string) {
    return this.prisma.contact.findUniqueOrThrow({
      where: { id },
      include: { customer: { select: { id: true, displayName: true } } },
    });
  }

  @Get("visits")
  async searchVisits(@Query() dto: SearchVisitsDto) {
    const where: any = {};
    if (dto.customerId) where.customerId = dto.customerId;
    if (dto.status) where.status = dto.status;
    if (dto.dateFrom || dto.dateTo) {
      where.scheduledAt = {};
      if (dto.dateFrom) where.scheduledAt.gte = new Date(dto.dateFrom);
      if (dto.dateTo) where.scheduledAt.lte = new Date(dto.dateTo);
    }
    return this.prisma.visit.findMany({
      where,
      include: { customer: { select: { id: true, displayName: true } } },
      orderBy: { scheduledAt: "desc" },
      take: 20,
    });
  }

  @Get("visits/:id")
  async getVisitDetails(@Param("id") id: string) {
    return this.prisma.visit.findUniqueOrThrow({
      where: { id },
      include: { customer: { select: { id: true, displayName: true } } },
    });
  }

  @Get("followups")
  async searchFollowups(@Query() dto: SearchFollowupsDto) {
    const where: any = {};
    if (dto.customerId) where.customerId = dto.customerId;
    if (dto.status) where.status = dto.status;
    return this.prisma.followUpTask.findMany({
      where,
      include: { customer: { select: { id: true, displayName: true } } },
      orderBy: { dueAt: "asc" },
      take: 20,
    });
  }

  @Get("dashboard")
  async getDashboardSummary(@Query("userId") userId: string) {
    const [
      totalCustomers,
      activeOpportunities,
      pendingTasks,
      scheduledVisits,
      pendingQuotes,
      openOrders,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { active: true } }),
      this.prisma.opportunity.count({
        where: { stage: { notIn: ["venta_cerrada", "perdida"] } },
      }),
      this.prisma.followUpTask.count({
        where: { status: "pendiente", assignedToUserId: userId },
      }),
      this.prisma.visit.count({
        where: { status: "programada", assignedToUserId: userId },
      }),
      this.prisma.quote.count({ where: { status: { in: ["abierta", "en_negociacion"] } } }),
      this.prisma.order.count({ where: { status: { notIn: ["entregado"] } } }),
    ]);

    return {
      totalCustomers,
      activeOpportunities,
      pendingTasks,
      scheduledVisits,
      pendingQuotes,
      openOrders,
    };
  }

  @Post("customers")
  async createCustomer(@Body() body: {
    legalName: string;
    displayName?: string;
    taxId?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    department?: string;
    notes?: string;
    segmentId?: string;
    assignedToUserId?: string;
  }) {
    return this.prisma.customer.create({
      data: {
        legalName: body.legalName,
        displayName: body.displayName ?? body.legalName,
        taxId: body.taxId ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        department: body.department ?? null,
        notes: body.notes ?? null,
        segmentId: body.segmentId!,
        assignedToUserId: body.assignedToUserId ?? null,
        active: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
  }

  @Patch("customers/:id")
  async updateCustomer(@Param("id") id: string, @Body() body: {
    legalName?: string;
    displayName?: string;
    taxId?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    department?: string;
    notes?: string;
    segmentId?: string;
    assignedToUserId?: string;
    active?: boolean;
  }) {
    return this.prisma.customer.update({
      where: { id },
      data: { ...body, updatedBy: SYSTEM_USER_ID },
    });
  }

  @Post("contacts")
  async createContact(@Body() body: {
    customerId: string;
    fullName: string;
    roleTitle?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
    notes?: string;
  }) {
    return this.prisma.contact.create({
      data: {
        customerId: body.customerId,
        fullName: body.fullName,
        roleTitle: body.roleTitle,
        phone: body.phone,
        email: body.email,
        isPrimary: body.isPrimary ?? false,
        notes: body.notes,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
  }

  @Patch("contacts/:id")
  async updateContact(@Param("id") id: string, @Body() body: {
    fullName?: string;
    roleTitle?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
    notes?: string;
  }) {
    return this.prisma.contact.update({
      where: { id },
      data: { ...body, updatedBy: SYSTEM_USER_ID },
    });
  }

  @Post("quotes")
  async createQuote(@Body() body: {
    customerId: string;
    opportunityId?: string;
    validUntil?: string;
    notes?: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      productSnapshotName?: string;
      productSnapshotSku?: string;
      unit?: string;
      notes?: string;
    }>;
  }) {
    const items = body.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.quantity * item.unitPrice,
      productSnapshotName: item.productSnapshotName ?? "",
      productSnapshotSku: item.productSnapshotSku ?? "",
      unit: item.unit ?? "",
      notes: item.notes ?? null,
    }));
    const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);

    return this.prisma.quote.create({
      data: {
        customerId: body.customerId,
        opportunityId: body.opportunityId,
        validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
        notes: body.notes,
        subtotal,
        total: subtotal,
        status: "abierta",
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  @Patch("quotes/:id/status")
  async updateQuoteStatus(@Param("id") id: string, @Body() body: { status: string }) {
    return this.prisma.quote.update({
      where: { id },
      data: { status: body.status as any, updatedBy: SYSTEM_USER_ID },
    });
  }

  @Post("orders")
  async createOrder(@Body() body: {
    customerId: string;
    opportunityId?: string;
    sourceQuoteId?: string;
    notes?: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      productSnapshotName?: string;
      productSnapshotSku?: string;
      unit?: string;
      notes?: string;
    }>;
  }) {
    const items = body.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.quantity * item.unitPrice,
      productSnapshotName: item.productSnapshotName ?? "",
      productSnapshotSku: item.productSnapshotSku ?? "",
      unit: item.unit ?? "",
      notes: item.notes ?? null,
    }));
    const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);

    return this.prisma.order.create({
      data: {
        customerId: body.customerId,
        opportunityId: body.opportunityId,
        sourceQuoteId: body.sourceQuoteId,
        notes: body.notes,
        subtotal,
        total: subtotal,
        status: "recibido",
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  @Patch("orders/:id/status")
  async updateOrderStatus(@Param("id") id: string, @Body() body: { status: string; notes?: string }) {
    return this.prisma.order.update({
      where: { id },
      data: { status: body.status as any, notes: body.notes, updatedBy: SYSTEM_USER_ID },
    });
  }

  @Post("products")
  async createProduct(@Body() body: {
    sku: string;
    name: string;
    description?: string;
    unit: string;
    presentation?: string;
    basePrice: number;
  }) {
    return this.prisma.product.create({
      data: {
        sku: body.sku,
        name: body.name,
        description: body.description ?? null,
        unit: body.unit,
        presentation: body.presentation ?? null,
        basePrice: body.basePrice,
        active: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
  }

  @Patch("products/:id")
  async updateProduct(@Param("id") id: string, @Body() body: {
    sku?: string;
    name?: string;
    description?: string;
    unit?: string;
    presentation?: string;
    basePrice?: number;
    active?: boolean;
  }) {
    return this.prisma.product.update({
      where: { id },
      data: { ...body, updatedBy: SYSTEM_USER_ID },
    });
  }

  @Post("segments")
  async createSegment(@Body() body: { name: string; description?: string }) {
    return this.prisma.customerSegment.create({
      data: {
        name: body.name,
        description: body.description,
        active: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
  }

  @Patch("segments/:id")
  async updateSegment(@Param("id") id: string, @Body() body: {
    name?: string;
    description?: string;
    active?: boolean;
  }) {
    return this.prisma.customerSegment.update({
      where: { id },
      data: { ...body, updatedBy: SYSTEM_USER_ID },
    });
  }

  @Patch("visits/:id")
  async updateVisit(@Param("id") id: string, @Body() body: {
    scheduledAt?: string;
    status?: string;
    summary?: string;
    diagnosis?: string;
    problems?: string;
    proposedSolution?: string;
    notes?: string;
    nextStep?: string;
  }) {
    const data: any = { ...body, updatedBy: SYSTEM_USER_ID };
    if (body.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);
    if (body.status === "completada") data.completedAt = new Date();
    return this.prisma.visit.update({ where: { id }, data });
  }

  @Patch("followups/:id")
  async updateFollowup(@Param("id") id: string, @Body() body: {
    title?: string;
    dueAt?: string;
    status?: string;
    notes?: string;
  }) {
    const data: any = { ...body, updatedBy: SYSTEM_USER_ID };
    if (body.dueAt) data.dueAt = new Date(body.dueAt);
    if (body.status === "completada") data.completedAt = new Date();
    return this.prisma.followUpTask.update({ where: { id }, data });
  }

  @Patch("opportunities/:id")
  async updateOpportunity(@Param("id") id: string, @Body() body: {
    stage?: string;
    estimatedValue?: number;
    expectedCloseDate?: string;
    title?: string;
    description?: string;
    lostReason?: string;
  }) {
    const data: any = { ...body, updatedBy: SYSTEM_USER_ID };
    if (body.expectedCloseDate) data.expectedCloseDate = new Date(body.expectedCloseDate);
    if (body.stage === "perdida" || body.stage === "venta_cerrada") data.closedAt = new Date();
    return this.prisma.opportunity.update({ where: { id }, data });
  }
}
