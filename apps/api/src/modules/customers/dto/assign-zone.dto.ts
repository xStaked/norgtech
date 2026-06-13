import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AssignZoneDto {
  @IsString()
  @IsNotEmpty()
  zoneId!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}
