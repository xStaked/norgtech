import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { PriceListKind } from "@prisma/client";

export class CreatePriceListDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @IsEnum(PriceListKind)
  kind!: PriceListKind;

  @IsString()
  @IsIn(["COP", "USD"])
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;
}
