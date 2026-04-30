import { OpportunityStage } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateOpportunityStageDto {
  @IsEnum(OpportunityStage)
  stage!: OpportunityStage;
}
