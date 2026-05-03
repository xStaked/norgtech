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
        ],
      },
      include: { contacts: true },
      take: 10,
    });

    return customers.map((c) => ({
      id: c.id,
      label: c.displayName,
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
      orderBy: { dueAt: "asc" },
    });

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt.toISOString(),
      type: t.type,
    }));
  }

  @Get("users/:userId/visits")
  async getScheduledVisits(@Param("userId") userId: string) {
    const visits = await this.prisma.visit.findMany({
      where: {
        status: VisitStatus.programada,
        OR: [{ assignedToUserId: userId }, { assignedToUserId: null }],
      },
      orderBy: { scheduledAt: "asc" },
    });

    return visits.map((v) => ({
      id: v.id,
      summary: v.summary ?? "",
      scheduledAt: v.scheduledAt.toISOString(),
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
}