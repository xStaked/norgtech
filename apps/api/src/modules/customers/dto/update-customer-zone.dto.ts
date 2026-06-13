import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateCustomerZoneDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
