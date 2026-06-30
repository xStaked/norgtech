import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateVisitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nextStep?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;
}
