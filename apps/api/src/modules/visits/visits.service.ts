import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, VisitStatus } from "@prisma/client";
import { parseInstant } from "../../shared/instant";
import { PrismaService } from "../../prisma/prisma.service";
import {
  dayRangeInZone,
  isVisitOverdue,
  visitOverdueWhere,
  weekRangeInZone,
} from "../../shared/overdue";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CompleteVisitDto } from "./dto/complete-visit.dto";
import { CreateVisitDto } from "./dto/create-visit.dto";
import { UpdateVisitDto } from "./dto/update-visit.dto";
import { UpdateVisitStatusDto } from "./dto/update-visit-status.dto";

export interface VisitFilters {
  status?: VisitStatus;
  today?: boolean;
  thisWeek?: boolean;
  overdue?: boolean;
  assignedToMe?: boolean;
  userId?: string;
  customerId?: string;
}

const allowedStatusTransitions: Record<VisitStatus, VisitStatus[]> = {
  programada: ["completada", "cancelada", "no_realizada"],
  completada: [],
  cancelada: [],
  no_realizada: [],
};

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateVisitDto) {
    return this.prisma.$transaction((tx) => this.createRecord(user, dto, tx));
  }

  createFromNora(
    user: AuthUser,
    input: {
      customerId?: string;
      customerLabel?: string;
      opportunityId?: string;
      occurredAt?: string;
      summary: string;
      rawMessage: string;
      nextStep?: string;
      signals?: {
        objections: string[];
        risk?: string;
        buyingIntent?: string;
      };
    },
    client?: Prisma.TransactionClient,
  ) {
    if (!input.customerId) {
      throw new NotFoundException("Customer not found");
    }

    const notes = [
      `Mensaje original: ${input.rawMessage}`,
      input.signals?.objections.length ? `Objeciones: ${input.signals.objections.join(", ")}` : "",
      input.signals?.risk ? `Riesgo: ${input.signals.risk}` : "",
      input.signals?.buyingIntent ? `Intencion de compra: ${input.signals.buyingIntent}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const payload = {
      customerId: input.customerId,
      opportunityId: input.opportunityId,
      scheduledAt: input.occurredAt ?? new Date().toISOString(),
      summary: input.summary,
      notes,
      nextStep: input.nextStep,
      assignedToUserId: user.id,
    };

    if (client) {
      return this.createRecord(user, payload, client);
    }

    return this.create(user, payload);
  }

  async updateStatus(
    user: AuthUser,
    visitId: string,
    dto: UpdateVisitStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findUnique({
        where: { id: visitId },
      });

      if (!visit) {
        throw new NotFoundException("Visit not found");
      }

      if (!this.isStatusTransitionAllowed(visit.status, dto.status)) {
        throw new BadRequestException("Invalid visit status transition");
      }

      const updatedCount = await tx.visit.updateMany({
        where: {
          id: visitId,
          status: visit.status,
        },
        data: {
          status: dto.status,
          updatedBy: user.id,
        },
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException("Visit status changed before update");
      }

      const updatedVisit = await tx.visit.findUnique({
        where: { id: visitId },
      });

      if (!updatedVisit) {
        throw new NotFoundException("Visit not found");
      }

      await this.auditService.record(
        {
          entityType: "Visit",
          entityId: updatedVisit.id,
          action: "visit.status_changed",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(visit)),
          nextState: JSON.parse(JSON.stringify(updatedVisit)),
        },
        tx,
      );

      return updatedVisit;
    });
  }

  async complete(user: AuthUser, visitId: string, dto: CompleteVisitDto) {
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findUnique({
        where: { id: visitId },
      });

      if (!visit) {
        throw new NotFoundException("Visit not found");
      }

      if (visit.status !== VisitStatus.programada) {
        throw new BadRequestException("Only scheduled visits can be completed");
      }

      const updatedCount = await tx.visit.updateMany({
        where: {
          id: visitId,
          status: VisitStatus.programada,
        },
        data: {
          status: VisitStatus.completada,
          completedAt: new Date(),
          summary: dto.summary,
          diagnosis: dto.diagnosis,
          problems: dto.problems,
          proposedSolution: dto.proposedSolution,
          notes: dto.notes,
          nextStep: dto.nextStep,
          updatedBy: user.id,
        },
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException("Visit status changed before update");
      }

      const updatedVisit = await tx.visit.findUnique({
        where: { id: visitId },
      });

      if (!updatedVisit) {
        throw new NotFoundException("Visit not found");
      }

      await this.auditService.record(
        {
          entityType: "Visit",
          entityId: updatedVisit.id,
          action: "visit.completed",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(visit)),
          nextState: JSON.parse(JSON.stringify(updatedVisit)),
        },
        tx,
      );

      return updatedVisit;
    });
  }

  async update(user: AuthUser, visitId: string, dto: UpdateVisitDto) {
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findUnique({
        where: { id: visitId },
      });

      if (!visit) {
        throw new NotFoundException("Visit not found");
      }

      if (dto.customerId !== undefined) {
        await this.assertCustomerExists(dto.customerId);
      }

      const data: Prisma.VisitUpdateInput = { updatedBy: user.id };

      if (dto.scheduledAt !== undefined) {
        data.scheduledAt = parseInstant(dto.scheduledAt);
      }
      if (dto.summary !== undefined) {
        data.summary = dto.summary;
      }
      if (dto.notes !== undefined) {
        data.notes = dto.notes;
      }
      if (dto.nextStep !== undefined) {
        data.nextStep = dto.nextStep;
      }
      if (dto.customerId !== undefined) {
        data.customer = { connect: { id: dto.customerId } };
      }

      const updatedVisit = await tx.visit.update({
        where: { id: visitId },
        data,
      });

      await this.auditService.record(
        {
          entityType: "Visit",
          entityId: updatedVisit.id,
          action: "visit.updated",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(visit)),
          nextState: JSON.parse(JSON.stringify(updatedVisit)),
        },
        tx,
      );

      return updatedVisit;
    });
  }

  async remove(user: AuthUser, visitId: string) {
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findUnique({ where: { id: visitId } });

      if (!visit) {
        throw new NotFoundException("Visit not found");
      }

      const [reportCount, expenseCount] = await Promise.all([
        tx.executiveReport.count({ where: { visitId } }),
        tx.commercialExpense.count({ where: { visitId } }),
      ]);

      if (reportCount > 0 || expenseCount > 0) {
        throw new ConflictException(
          "No se puede eliminar la visita porque tiene reportes o gastos asociados.",
        );
      }

      await tx.visit.delete({ where: { id: visitId } });

      await this.auditService.record(
        {
          entityType: "Visit",
          entityId: visit.id,
          action: "visit.deleted",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(visit)),
        },
        tx,
      );

      return { id: visit.id, deleted: true };
    });
  }

  async findWithFilters(filters: VisitFilters) {
    const now = new Date();
    const where: Prisma.VisitWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.assignedToMe && filters.userId) {
      where.assignedToUserId = filters.userId;
    }

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.today) {
      const { start, end } = dayRangeInZone(now);
      where.scheduledAt = { gte: start, lte: end };
    }

    if (filters.overdue) {
      Object.assign(where, visitOverdueWhere(now));
    }

    if (filters.thisWeek) {
      const { start, end } = weekRangeInZone(now);
      where.scheduledAt = { gte: start, lte: end };
    }

    const visits = await this.prisma.visit.findMany({
      where,
      include: { customer: true },
      orderBy: { scheduledAt: "desc" },
    });

    return visits.map((visit) => this.withDerivedState(visit, now));
  }

  async findAll() {
    const now = new Date();
    const visits = await this.prisma.visit.findMany({
      include: { customer: true },
      orderBy: { scheduledAt: "asc" },
    });

    return visits.map((visit) => this.withDerivedState(visit, now));
  }

  async findOne(id: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id },
      include: { customer: true },
    });

    return visit ? this.withDerivedState(visit, new Date()) : visit;
  }

  /**
   * Expone el estado derivado para que el front pinte la insignia sin
   * reimplementar la regla (y sin fiarse de la columna `status`).
   */
  private withDerivedState<T extends { status: VisitStatus; scheduledAt: Date }>(
    visit: T,
    now: Date,
  ) {
    return { ...visit, isOverdue: isVisitOverdue(visit, now) };
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

  async canGenerateReport(visitId: string): Promise<boolean> {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
    });

    if (!visit) {
      return false;
    }

    return visit.status === VisitStatus.completada && !!visit.summary;
  }

  private isStatusTransitionAllowed(
    currentStatus: VisitStatus,
    nextStatus: VisitStatus,
  ) {
    return allowedStatusTransitions[currentStatus].includes(nextStatus);
  }

  private async createRecord(
    user: AuthUser,
    dto: {
      customerId: string;
      opportunityId?: string;
      scheduledAt: string;
      notes?: string;
      summary?: string;
      nextStep?: string;
      assignedToUserId?: string;
    },
    client: Prisma.TransactionClient,
  ) {
    await this.assertCustomerExists(dto.customerId);

    if (dto.opportunityId) {
      await this.assertOpportunityExists(dto.opportunityId);
    }

    const visit = await client.visit.create({
      data: {
        customerId: dto.customerId,
        opportunityId: dto.opportunityId,
        scheduledAt: parseInstant(dto.scheduledAt),
        summary: dto.summary,
        notes: dto.notes,
        nextStep: dto.nextStep,
        // DASH-03: `assignedToUserId` es nullable y NINGUN formulario del web lo
        // envia, asi que toda visita creada desde la UI quedaba con NULL y no
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
        entityType: "Visit",
        entityId: visit.id,
        action: "visit.created",
        actorUserId: user.id,
        nextState: JSON.parse(JSON.stringify(visit)),
      },
      client,
    );

    return visit;
  }
}
