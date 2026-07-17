import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  nit?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(4)
  @Matches(/^[A-Z]+$/, { message: "El prefijo solo puede contener letras mayusculas" })
  prefix?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
