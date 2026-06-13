import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
