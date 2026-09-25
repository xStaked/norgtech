import { UserRole } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsNotEmpty, IsString, Matches } from "class-validator";

const internationalPhonePattern = /^\+[1-9]\d{9,14}$/;

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  name!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail()
  @IsNotEmpty()
  @IsString()
  email!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Matches(internationalPhonePattern)
  phone!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
