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
  carrierName?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  trackingUrl?: string;

  @IsOptional()
  @IsString()
  deliveredToName?: string;

  @IsOptional()
  @IsString()
  deliveryConfirmationNotes?: string;

  @IsOptional()
  @IsString()
  logisticsNotes?: string;
}
