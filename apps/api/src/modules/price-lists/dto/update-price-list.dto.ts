import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { PriceListKind } from "@prisma/client";

export class UpdatePriceListDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(PriceListKind)
  kind?: PriceListKind;

  @IsOptional()
  @IsString()
  @IsIn(["COP", "USD"])
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
