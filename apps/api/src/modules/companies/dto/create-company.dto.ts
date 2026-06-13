import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsString()
  @IsNotEmpty()
  nit!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4)
  @Matches(/^[A-Z]+$/, { message: "prefix must be uppercase letters only" })
  prefix!: string;
}
