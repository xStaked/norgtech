import { IsNumber, IsOptional, IsString, Matches, Min } from "class-validator";

export class CreateSpecialPriceListItemDto {
  @IsString()
  @Matches(/\S/)
  customerId!: string;

  @IsString()
  @Matches(/\S/)
  presentationId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceSinIva?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceConIva?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxPercent?: number;
}
