import { UserRole } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, ValidateIf } from "class-validator";

const internationalPhonePattern = /^\+[1-9]\d{9,14}$/;

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  name?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(internationalPhonePattern)
  phone?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
