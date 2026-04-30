import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from "class-validator";

export class CreateQuoteItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
