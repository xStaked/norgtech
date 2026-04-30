import { IsOptional, IsString } from "class-validator";

export class UpdateOrderLogisticsDto {
  @IsOptional()
  @IsString()
  assignedLogisticsUserId?: string;

  @IsOptional()
  @IsString()
  committedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  logisticsNotes?: string;
}
