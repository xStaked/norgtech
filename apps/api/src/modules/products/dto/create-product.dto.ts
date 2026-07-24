import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateProductPresentationDto } from "./product-presentation.dto";

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  sku!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  /** @deprecated Texto suelto del modelo viejo; usar `presentations`. */
  @IsOptional()
  @IsString()
  presentation?: string;

  /**
   * Vestigial: el precio real vive en PriceListItem. Opcional porque cotización
   * todavía cae aquí cuando el cliente no tiene lista asignada.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductPresentationDto)
  presentations?: CreateProductPresentationDto[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
