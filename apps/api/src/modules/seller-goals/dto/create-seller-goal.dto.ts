import { Type } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateSellerGoalDto {
  @IsIn(["mensual", "trimestral", "anual"])
  periodType!: string;

  @IsString()
  @MaxLength(7)
  periodValue!: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  targetAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
