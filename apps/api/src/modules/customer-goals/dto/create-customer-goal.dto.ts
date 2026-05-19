import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateCustomerGoalDto {
  @IsString()
  @IsIn(["mensual", "trimestral", "anual"])
  periodType!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(7)
  periodValue!: string;

  @IsNumber()
  @Min(0)
  targetAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
