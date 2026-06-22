import { IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class ResolveOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}
