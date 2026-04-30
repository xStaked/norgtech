import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FollowUpTaskStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateFollowUpTaskDto } from "./dto/create-follow-up-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";

export interface FollowUpTaskFilters {
  status?: FollowUpTaskStatus;
  dueToday?: boolean;
  overdue?: boolean;
  assignedToMe?: boolean;
  thisWeek?: boolean;
  userId?: string;
}

const allowedStatusTransitions: Record<FollowUpTaskStatus, FollowUpTaskStatus[]> = {
  pendiente: ["completada", "vencida"],
  completada: [],
  vencida: [],
};

@Injectable()
export class FollowUpTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateFollowUpTaskDto) {
    await this.assertCustomerExists(dto.customerId);

    if (dto.opportunityId) {
      await this.assertOpportunityExists(dto.opportunityId);
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.followUpTask.create({
        data: {
          customerId: dto.customerId,
          opportunityId: dto.opportunityId,
          type: dto.type,
          title: dto.title,
          dueAt: new Date(dto.dueAt),
          notes: dto.notes,
          assignedToUserId: dto.assignedToUserId,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      await this.auditService.record(
        {
          entityType: "FollowUpTask",
          entityId: task.id,
          action: "follow_up_task.created",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(task)),
        },
        tx,
      );

      return task;
    });
  }

  async updateStatus(
    user: AuthUser,
    taskId: string,
    dto: UpdateTaskStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.followUpTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new NotFoundException("Follow-up task not found");
      }

      if (!this.isStatusTransitionAllowed(task.status, dto.status)) {
        throw new BadRequestException("Invalid follow-up task status transition");
      }

      const updatedCount = await tx.followUpTask.updateMany({
        where: {
          id: taskId,
          status: task.status,
        },
        data: {
          status: dto.status,
          updatedBy: user.id,
        },
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException("Follow-up task status changed before update");
      }

      const updatedTask = await tx.followUpTask.findUnique({
        where: { id: taskId },
      });

      if (!updatedTask) {
        throw new NotFoundException("Follow-up task not found");
      }

      await this.auditService.record(
        {
          entityType: "FollowUpTask",
          entityId: updatedTask.id,
          action: "follow_up_task.status_changed",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(task)),
          nextState: JSON.parse(JSON.stringify(updatedTask)),
        },
        tx,
      );

      return updatedTask;
    });
  }

  async complete(user: AuthUser, taskId: string) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.followUpTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new NotFoundException("Follow-up task not found");
      }

      if (task.status !== FollowUpTaskStatus.pendiente) {
        throw new BadRequestException("Only pending tasks can be completed");
      }

      const updatedCount = await tx.followUpTask.updateMany({
        where: {
          id: taskId,
          status: FollowUpTaskStatus.pendiente,
        },
        data: {
          status: FollowUpTaskStatus.completada,
          completedAt: new Date(),
          updatedBy: user.id,
        },
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException("Follow-up task status changed before update");
      }

      const updatedTask = await tx.followUpTask.findUnique({
        where: { id: taskId },
      });

      if (!updatedTask) {
        throw new NotFoundException("Follow-up task not found");
      }

      await this.auditService.record(
        {
          entityType: "FollowUpTask",
          entityId: updatedTask.id,
          action: "follow_up_task.completed",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(task)),
          nextState: JSON.parse(JSON.stringify(updatedTask)),
        },
        tx,
      );

      return updatedTask;
    });
  }

  async markOverdue() {
    const now = new Date();
    return this.prisma.followUpTask.updateMany({
      where: {
        dueAt: { lt: now },
        status: FollowUpTaskStatus.pendiente,
      },
      data: {
        status: FollowUpTaskStatus.vencida,
      },
    });
  }

  findWithFilters(filters: FollowUpTaskFilters) {
    const where: Record<string, unknown> = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.assignedToMe && filters.userId) {
      where.assignedToUserId = filters.userId;
    }

    if (filters.dueToday) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.dueAt = { gte: start, lte: end };
    }

    if (filters.overdue) {
      const now = new Date();
      where.dueAt = { lt: now };
      where.status = FollowUpTaskStatus.pendiente;
    }

    if (filters.thisWeek) {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const start = new Date(now);
      start.setDate(now.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      where.dueAt = { gte: start, lte: end };
    }

    return this.prisma.followUpTask.findMany({
      where,
      include: { customer: true },
      orderBy: { dueAt: "asc" },
    });
  }

  findAll() {
    return this.prisma.followUpTask.findMany({
      include: { customer: true },
      orderBy: { dueAt: "asc" },
    });
  }

  findOne(id: string) {
    return this.prisma.followUpTask.findUnique({
      where: { id },
      include: { customer: true },
    });
  }

  private async assertCustomerExists(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }

  private async assertOpportunityExists(opportunityId: string) {
    const opportunity = await this.prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      throw new NotFoundException("Opportunity not found");
    }
  }

  private isStatusTransitionAllowed(
    currentStatus: FollowUpTaskStatus,
    nextStatus: FollowUpTaskStatus,
  ) {
    return allowedStatusTransitions[currentStatus].includes(nextStatus);
  }
}
