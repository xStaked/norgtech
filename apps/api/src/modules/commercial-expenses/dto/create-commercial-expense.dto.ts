import { CommercialExpenseCategory } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateCommercialExpenseDto {
  @IsDateString()
  expenseDate!: string;

  @IsEnum(CommercialExpenseCategory)
  category!: CommercialExpenseCategory;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  supplierNit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentMethod?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ""
      ? undefined
      : Number(value),
  )
  @IsNumber()
  @Min(0)
  @Max(1)
  extractionConfidence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  extractionModel?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  visitId?: string;
}
