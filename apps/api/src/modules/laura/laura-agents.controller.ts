import {
  Body,
  Controller,
  Get,
  Param,
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
}