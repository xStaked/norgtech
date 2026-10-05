import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateQuoteItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  /** Presentación elegida. Desambigua el precio cuando el cliente tiene lista. */
  @IsOptional()
  @IsString()
  presentationId?: string;

  /** Empaque en texto, para cuando no hay presentationId. */
  @IsOptional()
  @IsString()
  presentation?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  /** Bonificación fase 2: % Tabla (10/20/30/40). */
  @IsOptional()
  @IsIn([10, 20, 30, 40])
  bonusPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
