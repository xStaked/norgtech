import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateOrderItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  presentation?: string;

  /** Presentación elegida. Desambigua el precio cuando el cliente tiene lista. */
  @IsOptional()
  @IsString()
  presentationId?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  needsResolution?: boolean;
}
