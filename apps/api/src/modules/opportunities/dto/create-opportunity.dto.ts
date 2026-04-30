import { OpportunityStage } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

export class CreateOpportunityDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  title!: string;

  @IsEnum(OpportunityStage)
  stage!: OpportunityStage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedValue?: number;
}
