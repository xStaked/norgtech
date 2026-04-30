import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from "class-validator";

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

  @IsOptional()
  @IsString()
  presentation?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
