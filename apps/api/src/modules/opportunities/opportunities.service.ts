import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OpportunityStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOpportunityDto } from "./dto/create-opportunity.dto";
import { UpdateOpportunityStageDto } from "./dto/update-opportunity-stage.dto";
import { allowedTransitions } from "./opportunity-stage-transition-map";

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateOpportunityDto) {
    await this.assertCustomerExists(dto.customerId);

    return this.prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.create({
        data: {
          customerId: dto.customerId,
          title: dto.title,
          stage: dto.stage,
          estimatedValue: dto.estimatedValue,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      await this.auditService.record(
        {
          entityType: "Opportunity",
          entityId: opportunity.id,
          action: "opportunity.created",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(opportunity)),
        },
        tx,
      );

      return opportunity;
    });
  }

  async updateStage(
    user: AuthUser,
    opportunityId: string,
    dto: UpdateOpportunityStageDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.findUnique({
        where: { id: opportunityId },
      });

      if (!opportunity) {
        throw new NotFoundException("Opportunity not found");
      }

      if (!this.isTransitionAllowed(opportunity.stage, dto.stage)) {
        throw new BadRequestException("Invalid opportunity stage transition");
      }

      const updatedCount = await tx.opportunity.updateMany({
        where: {
          id: opportunityId,
          stage: opportunity.stage,
        },
        data: {
          stage: dto.stage,
          updatedBy: user.id,
        },
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException(
          "Opportunity stage changed before update",
        );
      }

      const updatedOpportunity = await tx.opportunity.findUnique({
        where: { id: opportunityId },
      });

      if (!updatedOpportunity) {
        throw new NotFoundException("Opportunity not found");
      }

      await this.auditService.record(
        {
          entityType: "Opportunity",
          entityId: updatedOpportunity.id,
          action: "opportunity.stage_changed",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(opportunity)),
          nextState: JSON.parse(JSON.stringify(updatedOpportunity)),
        },
        tx,
      );

      return updatedOpportunity;
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

  findAll() {
    return this.prisma.opportunity.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(id: string) {
    return this.prisma.opportunity.findUnique({
      where: { id },
      include: { customer: true },
    });
  }

  private isTransitionAllowed(
    currentStage: OpportunityStage,
    nextStage: OpportunityStage,
  ) {
    return allowedTransitions[currentStage].includes(nextStage);
  }
}
