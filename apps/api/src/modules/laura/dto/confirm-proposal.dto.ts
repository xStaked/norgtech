import { FollowUpTaskType, OpportunityStage } from "@prisma/client";
import { Type } from "class-transformer";
import {
  Allow,
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

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  relatedTo?: string;

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
  relatedTo?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  customerId?: string;

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

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  relatedTo?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  customerId?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  dueAt?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  opportunityId?: string;

  @IsOptional()
  @IsEnum(FollowUpTaskType)
  type?: FollowUpTaskType;
}

class LauraTaskBlockDto implements NonNullable<LauraProposalPayload["blocks"]["task"]> {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  relatedTo?: string;

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

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  customerId?: string;
}

class LauraSignalsBlockDto implements NonNullable<LauraProposalPayload["blocks"]["signals"]> {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  relatedTo?: string;

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

class LauraCustomerBlockDto {
  @Allow() enabled!: boolean;
  @Allow() action!: "create" | "update" | "delete";
  @Allow() id?: string;
  @Allow() relatedTo?: string;
  @Allow() legalName?: string;
  @Allow() displayName?: string;
  @Allow() taxId?: string;
  @Allow() phone?: string;
  @Allow() email?: string;
  @Allow() address?: string;
  @Allow() city?: string;
  @Allow() department?: string;
  @Allow() notes?: string;
  @Allow() segmentId?: string;
  @Allow() assignedToUserId?: string;
}

class LauraContactBlockDto {
  @Allow() enabled!: boolean;
  @Allow() action!: "create" | "update" | "delete";
  @Allow() id?: string;
  @Allow() relatedTo?: string;
  @Allow() customerId?: string;
  @Allow() fullName?: string;
  @Allow() roleTitle?: string;
  @Allow() phone?: string;
  @Allow() email?: string;
  @Allow() isPrimary?: boolean;
  @Allow() notes?: string;
}

class LauraQuoteBlockDto {
  @Allow() enabled!: boolean;
  @Allow() action!: "create" | "update" | "delete";
  @Allow() id?: string;
  @Allow() relatedTo?: string;
  @Allow() customerId?: string;
  @Allow() opportunityId?: string;
  @Allow() validUntil?: string;
  @Allow() notes?: string;
  @Allow() items?: Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }>;
}

class LauraOrderBlockDto {
  @Allow() enabled!: boolean;
  @Allow() action!: "create" | "update" | "delete";
  @Allow() id?: string;
  @Allow() relatedTo?: string;
  @Allow() customerId?: string;
  @Allow() opportunityId?: string;
  @Allow() sourceQuoteId?: string;
  @Allow() notes?: string;
  @Allow() items?: Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }>;
}

class LauraProductBlockDto {
  @Allow() enabled!: boolean;
  @Allow() action!: "create" | "update" | "delete";
  @Allow() id?: string;
  @Allow() relatedTo?: string;
  @Allow() sku?: string;
  @Allow() name?: string;
  @Allow() description?: string;
  @Allow() unit?: string;
  @Allow() presentation?: string;
  @Allow() basePrice?: number;
}

class LauraSegmentBlockDto {
  @Allow() enabled!: boolean;
  @Allow() action!: "create" | "update" | "delete";
  @Allow() id?: string;
  @Allow() relatedTo?: string;
  @Allow() name?: string;
  @Allow() description?: string;
}

class LauraVisitBlockDto {
  @Allow() enabled!: boolean;
  @Allow() action!: "create" | "update" | "delete";
  @Allow() id?: string;
  @Allow() relatedTo?: string;
  @Allow() customerId?: string;
  @Allow() opportunityId?: string;
  @Allow() scheduledAt?: string;
  @Allow() summary?: string;
  @Allow() notes?: string;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraCustomerBlockDto)
  customer?: LauraCustomerBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraContactBlockDto)
  contact?: LauraContactBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraQuoteBlockDto)
  quote?: LauraQuoteBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraOrderBlockDto)
  order?: LauraOrderBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraProductBlockDto)
  product?: LauraProductBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraSegmentBlockDto)
  segment?: LauraSegmentBlockDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraVisitBlockDto)
  visit?: LauraVisitBlockDto;
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
