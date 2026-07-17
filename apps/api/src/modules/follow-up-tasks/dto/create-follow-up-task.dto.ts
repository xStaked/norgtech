import { FollowUpTaskType } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import { IsInstantString } from "../../../shared/is-instant.decorator";

export class CreateFollowUpTaskDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;

  @IsEnum(FollowUpTaskType)
  type!: FollowUpTaskType;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  title!: string;

  @IsInstantString()
  dueAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  assignedToUserId?: string;
}
