import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import { IsInstantString } from "../../../shared/is-instant.decorator";

export class CreateVisitDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;

  @IsInstantString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  summary?: string;

  @IsOptional()
  @IsString()
  nextStep?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  assignedToUserId?: string;
}
