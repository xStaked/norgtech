import { CommercialExpenseStatus } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateCommercialExpenseStatusDto {
  @IsEnum(CommercialExpenseStatus)
  status!: CommercialExpenseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
