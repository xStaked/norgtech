import { IsNumber, IsOptional, IsString, Matches, Min } from "class-validator";

/**
 * Fija el precio de una presentación dentro de una lista.
 *
 * Todos los precios son opcionales: el Excel del cliente trae filas con solo
 * uno de los dos lados (sin/con IVA), y la regla es subir lo que mandó tal
 * cual, no completar el que falta.
 */
export class UpsertPriceListItemDto {
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

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceSinIva2?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceConIva2?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceSinIva3?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceConIva3?: number;
}
