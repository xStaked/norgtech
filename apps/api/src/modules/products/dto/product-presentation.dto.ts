import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

/**
 * Presentación vendible de un producto (el empaque). Los precios NO viven aquí:
 * viven en PriceListItem, por par (presentación, lista).
 */
export class CreateProductPresentationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  empaque!: string;

  @IsOptional()
  @IsString()
  form?: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateProductPresentationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  empaque?: string;

  @IsOptional()
  @IsString()
  form?: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
