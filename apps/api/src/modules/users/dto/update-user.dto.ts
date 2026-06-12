import { UserRole } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
