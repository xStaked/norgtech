import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  fullName!: string;

  @IsOptional()
  @IsString()
  roleTitle?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
