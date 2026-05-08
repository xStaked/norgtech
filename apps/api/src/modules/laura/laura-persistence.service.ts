import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthUser } from "../auth/types/authenticated-request";
import { FollowUpTasksService } from "../follow-up-tasks/follow-up-tasks.service";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import { VisitsService } from "../visits/visits.service";
import { ConfirmProposalDto } from "./dto/confirm-proposal.dto";
import { LauraProposalExecutionError, LauraProposalExecutionResult, LauraStoredProposalPayload } from "./laura.types";
import { formatIsoDate } from "./laura-date-parser";

@Injectable()
export class LauraPersistenceService {
  constructor(
    private readonly visitsService: VisitsService,
    private readonly followUpTasksService: FollowUpTasksService,
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  async persistApprovedBlocks(
    user: AuthUser,
    proposal: LauraStoredProposalPayload,
    confirmation: ConfirmProposalDto,
    client?: Prisma.TransactionClient,
  ): Promise<LauraProposalExecutionResult> {
    const saved: string[] = [];
    const discarded: string[] = [];
    const createdIds: Record<string, string> = {};
    const errors: LauraProposalExecutionError[] = [];
    const resolvedIds: Record<string, string> = {};
    const blocks = confirmation.proposal.blocks;
    const customerId = proposal.internal?.customerId;
    const customerLabel = proposal.internal?.customerLabel;

    let opportunityId = blocks.followUp?.opportunityId
      ?? blocks.opportunity?.opportunityId
      ?? proposal.internal?.opportunityId;

    if (blocks.opportunity?.enabled) {
      if (blocks.opportunity.createNew && customerId && blocks.opportunity.title && blocks.opportunity.stage) {
        try {
          const createdOpportunity = await this.opportunitiesService.createFromLaura(
            user,
            {
              customerId,
              title: blocks.opportunity.title,
              stage: blocks.opportunity.stage,
            },
            client,
          );
          opportunityId = createdOpportunity.id;
          saved.push("opportunity");
          createdIds.opportunity = createdOpportunity.id;
          resolvedIds.opportunity = createdOpportunity.id;
        } catch (error) {
          errors.push({ block: "opportunity", message: this.toErrorMessage(error) });
        }
      } else if (blocks.opportunity.opportunityId && blocks.opportunity.stage) {
        try {
          const updatedOpportunity = await this.opportunitiesService.updateStageFromLaura(
            user,
            blocks.opportunity.opportunityId,
            blocks.opportunity.stage,
            client,
          );
          opportunityId = updatedOpportunity.id;
          saved.push("opportunity");
          createdIds.opportunity = updatedOpportunity.id;
          resolvedIds.opportunity = updatedOpportunity.id;
        } catch (error) {
          errors.push({ block: "opportunity", message: this.toErrorMessage(error) });
        }
      } else {
        discarded.push("opportunity");
      }
    } else if (blocks.opportunity) {
      discarded.push("opportunity");
    }

    if (blocks.interaction?.enabled) {
      if (!this.dependencySatisfied(blocks.interaction.relatedTo, saved, resolvedIds)) {
        discarded.push("interaction");
      } else {
        try {
          const visit = await this.visitsService.createFromLaura(
            user,
            {
              customerId,
              customerLabel,
              opportunityId,
              occurredAt: proposal.internal?.occurredAt,
              summary: blocks.interaction.summary,
              rawMessage: blocks.interaction.rawMessage,
              nextStep: blocks.followUp?.enabled ? blocks.followUp.title : undefined,
              signals: blocks.signals?.enabled ? blocks.signals : undefined,
            },
            client,
          );
          saved.push("interaction");
          createdIds.interaction = visit.id;
          resolvedIds.interaction = visit.id;
        } catch (error) {
          errors.push({ block: "interaction", message: this.toErrorMessage(error) });
        }
      }
    } else if (blocks.interaction) {
      discarded.push("interaction");
    }

    if (blocks.followUp?.enabled && customerId && blocks.followUp.title && blocks.followUp.dueAt && blocks.followUp.type) {
      if (!this.dependencySatisfied(blocks.followUp.relatedTo, saved, resolvedIds)) {
        discarded.push("followUp");
      } else {
        try {
          const task = await this.followUpTasksService.createFromLaura(
            user,
            {
              customerId,
              opportunityId: blocks.followUp.opportunityId ?? opportunityId,
              title: blocks.followUp.title,
              dueAt: blocks.followUp.dueAt,
              type: blocks.followUp.type,
            },
            client,
          );
          saved.push("followUp");
          createdIds.followUp = task.id;
          resolvedIds.followUp = task.id;
        } catch (error) {
          errors.push({ block: "followUp", message: this.toErrorMessage(error) });
        }
      }
    } else if (blocks.followUp) {
      discarded.push("followUp");
    }

    if (blocks.task?.enabled && customerId) {
      if (!this.dependencySatisfied(blocks.task.relatedTo, saved, resolvedIds)) {
        discarded.push("task");
      } else {
        try {
          const task = await this.followUpTasksService.createFromLaura(
            user,
            {
              customerId,
              opportunityId: opportunityId ?? undefined,
              title: blocks.task.title,
              dueAt: blocks.task.dueAt ?? blocks.followUp?.dueAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
              type: "llamada",
            },
            client,
          );
          saved.push("task");
          createdIds.task = task.id;
          resolvedIds.task = task.id;
        } catch (error) {
          errors.push({ block: "task", message: this.toErrorMessage(error) });
        }
      }
    } else if (blocks.task) {
      discarded.push("task");
    }

    if (blocks.signals) {
      if (blocks.signals.enabled && createdIds.interaction) {
        saved.push("signals");
      } else {
        discarded.push("signals");
      }
    }

    return { saved, discarded, createdIds, errors };
  }

  private dependencySatisfied(
    relatedTo: string | undefined,
    saved: string[],
    resolvedIds: Record<string, string>,
  ): boolean {
    if (!relatedTo) return true;
    return saved.includes(relatedTo) || Object.values(resolvedIds).some((value) => value === relatedTo);
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return "Unknown persistence error";
  }
}
