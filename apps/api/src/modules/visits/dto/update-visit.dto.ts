import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { IsInstantString } from "../../../shared/is-instant.decorator";

export class UpdateVisitDto {
  @IsOptional()
  @IsInstantString()
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
