import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FollowUpTaskStatus, FollowUpTaskType, Prisma } from "@prisma/client";
import { parseInstant } from "../../shared/instant";
import { PrismaService } from "../../prisma/prisma.service";
import {
  dayRangeInZone,
  followUpTaskOverdueWhere,
  isFollowUpTaskOverdue,
  weekRangeInZone,
} from "../../shared/overdue";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateFollowUpTaskDto } from "./dto/create-follow-up-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { auditState } from "../audit/audit-state";

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
    return this.prisma.$transaction((tx) => this.createRecord(user, dto, tx));
  }

  createFromNora(
    user: AuthUser,
    input: {
      customerId: string;
      opportunityId?: string;
      type: FollowUpTaskType;
      title: string;
      dueAt: string;
    },
    client?: Prisma.TransactionClient,
  ) {
    if (client) {
      return this.createRecord(user, {
        ...input,
        assignedToUserId: user.id,
      }, client);
    }

    return this.create(user, {
      ...input,
      assignedToUserId: user.id,
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
        include: { customer: { select: { assignedToUserId: true } } },
      });

      if (!task) {
        throw new NotFoundException("Follow-up task not found");
      }
      this.assertCanAccess(user, task);

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
          previousState: auditState(task),
          nextState: auditState(updatedTask),
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
        include: { customer: { select: { assignedToUserId: true } } },
      });

      if (!task) {
        throw new NotFoundException("Follow-up task not found");
      }
      this.assertCanAccess(user, task);

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
          previousState: auditState(task),
          nextState: auditState(updatedTask),
        },
        tx,
      );

      return updatedTask;
    });
  }

  /**
   * Alcance comercial: sus tareas asignadas o las de su cartera. Se aplica
   * SIEMPRE al listado sin filtros y se ANDea con los filtros cuando los hay.
   */
  private comercialScope(user: AuthUser): Prisma.FollowUpTaskWhereInput | null {
    if (user.role !== "comercial") return null;
    return {
      OR: [{ assignedToUserId: user.id }, { customer: { assignedToUserId: user.id } }],
    };
  }

  private assertCanAccess(
    user: AuthUser,
    task: { assignedToUserId: string | null; customer?: { assignedToUserId?: string | null } | null },
  ) {
    if (
      user.role === "comercial" &&
      task.assignedToUserId !== user.id &&
      task.customer?.assignedToUserId !== user.id
    ) {
      throw new ForbiddenException("No tienes acceso a esta tarea");
    }
  }

  async findWithFilters(filters: FollowUpTaskFilters, user?: AuthUser) {
    const now = new Date();
    const where: Prisma.FollowUpTaskWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.assignedToMe && filters.userId) {
      where.assignedToUserId = filters.userId;
    }

    if (filters.dueToday) {
      const { start, end } = dayRangeInZone(now);
      where.dueAt = { gte: start, lte: end };
    }

    if (filters.overdue) {
      Object.assign(where, followUpTaskOverdueWhere(now));
    }

    if (filters.thisWeek) {
      const { start, end } = weekRangeInZone(now);
      where.dueAt = { gte: start, lte: end };
    }

    // El scoping comercial se ANDea: no se le cuelan ajenos con filtros.
    if (user) {
      const scope = this.comercialScope(user);
      if (scope) {
        where.AND = [...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []), scope];
      }
    }

    const tasks = await this.prisma.followUpTask.findMany({
      where,
      include: { customer: true },
      orderBy: { dueAt: "asc" },
    });

    return tasks.map((task) => this.withDerivedState(task, now));
  }

  async findAll(user?: AuthUser) {
    const now = new Date();
    const scope = user ? this.comercialScope(user) : null;
    const tasks = await this.prisma.followUpTask.findMany({
      where: scope ?? undefined,
      include: { customer: true },
      orderBy: { dueAt: "asc" },
    });

    return tasks.map((task) => this.withDerivedState(task, now));
  }

  async findOne(user: AuthUser, id: string) {
    const task = await this.prisma.followUpTask.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (task && user.role === "comercial") {
      this.assertCanAccess(user, task);
    }
    return task ? this.withDerivedState(task, new Date()) : task;
  }

  /**
   * Expone el estado derivado para que el front pinte la insignia sin
   * reimplementar la regla (y sin fiarse de la columna `status`).
   */
  private withDerivedState<T extends { status: FollowUpTaskStatus; dueAt: Date }>(
    task: T,
    now: Date,
  ) {
    return { ...task, isOverdue: isFollowUpTaskOverdue(task, now) };
  }

  private async assertCustomerExists(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
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

  private async createRecord(
    user: AuthUser,
    dto: {
      customerId: string;
      opportunityId?: string;
      type: FollowUpTaskType;
      title: string;
      dueAt: string;
      notes?: string;
      assignedToUserId?: string;
    },
    client: Prisma.TransactionClient,
  ) {
    const customer = await this.assertCustomerExists(dto.customerId);
    // Un comercial solo crea tareas para su cartera.
    if (user.role === "comercial" && customer.assignedToUserId !== user.id) {
      throw new ForbiddenException("No tienes acceso a este cliente");
    }

    if (dto.opportunityId) {
      await this.assertOpportunityExists(dto.opportunityId);
    }

    const task = await client.followUpTask.create({
      data: {
        customerId: dto.customerId,
        opportunityId: dto.opportunityId,
        type: dto.type,
        title: dto.title,
        dueAt: parseInstant(dto.dueAt),
        notes: dto.notes,
        // DASH-03: `assignedToUserId` es nullable y NINGUN formulario del web lo
        // envia, asi que toda tarea creada desde la UI quedaba con NULL y no
        // aparecia en la cola de nadie ("Mi cola de trabajo" filtra por
        // assignedToUserId = user.id). Solo createFromNora lo pasaba explicito.
        // El creador es el dueño por defecto; un assignedToUserId explicito manda.
        assignedToUserId: dto.assignedToUserId ?? user.id,
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
        nextState: auditState(task),
      },
      client,
    );

    return task;
  }
}
