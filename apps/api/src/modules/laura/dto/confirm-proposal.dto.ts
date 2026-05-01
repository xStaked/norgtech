import { FollowUpTaskType, OpportunityStage } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";
import { LauraProposalPayload } from "../laura.types";

type LauraProposalBlocks = LauraProposalPayload["blocks"];

class LauraInteractionBlockDto implements NonNullable<LauraProposalPayload["blocks"]["interaction"]> {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Matches(/\S/)
  summary!: string;

  @IsString()
  @Matches(/\S/)
  rawMessage!: string;
}

class LauraOpportunityBlockDto implements NonNullable<LauraProposalPayload["blocks"]["opportunity"]> {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  opportunityId?: string;

  @IsOptional()
  @IsBoolean()
  createNew?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  title?: string;

  @IsOptional()
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;
}

class LauraFollowUpBlockDto implements NonNullable<LauraProposalPayload["blocks"]["followUp"]> {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Matches(/\S/)
  title!: string;

  @IsString()
  @Matches(/\S/)
  dueAt!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  opportunityId?: string;

  @IsEnum(FollowUpTaskType)
  type!: FollowUpTaskType;
}

class LauraTaskBlockDto implements NonNullable<LauraProposalPayload["blocks"]["task"]> {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Matches(/\S/)
  title!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  dueAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class LauraSignalsBlockDto implements NonNullable<LauraProposalPayload["blocks"]["signals"]> {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @IsString({ each: true })
  objections!: string[];

  @IsOptional()
  @IsString()
  risk?: string;

  @IsOptional()
  @IsString()
  buyingIntent?: string;
}

class LauraProposalBlocksDto implements LauraProposalBlocks {
  @IsOptional()
  @ValidateNested()
  @Type(() => LauraInteractionBlockDto)
  interaction?: LauraInteractionBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraOpportunityBlockDto)
  opportunity?: LauraOpportunityBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraFollowUpBlockDto)
  followUp?: LauraFollowUpBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraTaskBlockDto)
  task?: LauraTaskBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraSignalsBlockDto)
  signals?: LauraSignalsBlockDto;
}

class LauraProposalPayloadDto implements LauraProposalPayload {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => LauraProposalBlocksDto)
  blocks!: LauraProposalBlocksDto;
}

export class ConfirmProposalDto {
  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => LauraProposalPayloadDto)
  proposal!: LauraProposalPayloadDto;
}
