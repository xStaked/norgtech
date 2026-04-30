import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { VisitStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CompleteVisitDto } from "./dto/complete-visit.dto";
import { CreateVisitDto } from "./dto/create-visit.dto";
import { UpdateVisitStatusDto } from "./dto/update-visit-status.dto";

export interface VisitFilters {
  status?: VisitStatus;
  today?: boolean;
  thisWeek?: boolean;
  assignedToMe?: boolean;
  userId?: string;
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
    await this.assertCustomerExists(dto.customerId);

    if (dto.opportunityId) {
      await this.assertOpportunityExists(dto.opportunityId);
    }

    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.create({
        data: {
          customerId: dto.customerId,
          opportunityId: dto.opportunityId,
          scheduledAt: new Date(dto.scheduledAt),
          summary: dto.summary,
          notes: dto.notes,
          nextStep: dto.nextStep,
          assignedToUserId: dto.assignedToUserId,
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
        tx,
      );

      return visit;
    });
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

  findWithFilters(filters: VisitFilters) {
    const where: Record<string, unknown> = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.assignedToMe && filters.userId) {
      where.assignedToUserId = filters.userId;
    }

    if (filters.today) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.scheduledAt = { gte: start, lte: end };
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
      where.scheduledAt = { gte: start, lte: end };
    }

    return this.prisma.visit.findMany({
      where,
      include: { customer: true },
      orderBy: { scheduledAt: "desc" },
    });
  }

  findAll() {
    return this.prisma.visit.findMany({
      include: { customer: true },
      orderBy: { scheduledAt: "asc" },
    });
  }

  findOne(id: string) {
    return this.prisma.visit.findUnique({
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
}
