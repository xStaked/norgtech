import { IsNumber, IsOptional, IsString } from "class-validator";

export class CostCalculationDto {
  @IsNumber()
  unitCost!: number;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  @IsOptional()
  installationCost?: number;

  @IsNumber()
  @IsOptional()
  maintenanceAnnual?: number;

  @IsString()
  @IsOptional()
  projectName?: string;
}
