import { IsNumber, IsOptional, IsString } from "class-validator";

export class RoiCalculationDto {
  @IsNumber()
  investment!: number;

  @IsNumber()
  annualSavings!: number;

  @IsNumber()
  @IsOptional()
  annualRevenueIncrease?: number;

  @IsString()
  @IsOptional()
  projectName?: string;
}
