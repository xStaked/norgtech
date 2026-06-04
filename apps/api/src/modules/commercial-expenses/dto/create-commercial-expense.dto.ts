import { CommercialExpenseCategory } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
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
  customerId?: string;

  @IsOptional()
  @IsString()
  visitId?: string;
}
