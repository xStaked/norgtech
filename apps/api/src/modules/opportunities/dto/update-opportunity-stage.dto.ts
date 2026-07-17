import { OpportunityStage } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateOpportunityStageDto {
  @IsEnum(OpportunityStage)
  stage!: OpportunityStage;

  // OPP-02: `Opportunity.lostReason` existia en el schema pero nada lo escribia.
  // Es opcional para no romper a Nora (updateStageFromNora solo pasa `stage`) ni
  // las transiciones que no van a `perdida`.
  @IsOptional()
  @IsString()
  lostReason?: string;
}
