import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateOrderItemDto {
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
