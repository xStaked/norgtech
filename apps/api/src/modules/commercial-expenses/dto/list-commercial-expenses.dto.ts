import {
  CommercialExpenseCategory,
  CommercialExpenseStatus,
} from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";

export class ListCommercialExpensesDto {
  @IsOptional()
  @IsEnum(CommercialExpenseStatus)
  status?: CommercialExpenseStatus;

  @IsOptional()
  @IsEnum(CommercialExpenseCategory)
  category?: CommercialExpenseCategory;

  @IsOptional()
  @IsString()
  submittedByUserId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  @IsIn(["csv", "xlsx"])
  format?: "csv" | "xlsx";
}
